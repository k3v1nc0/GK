import { NODE_TYPES } from "../shared/node-types.js";
import {
  NODE_CONTRACT_VERSION,
  canonicalJsonStringify,
  deepCloneJson,
  isCanonicalId,
  normalizeCanonicalId,
  normalizeReferenceKind,
  normalizeTagList
} from "../shared/node-contract.js";
import { buildReferenceSearchTerms, referenceKindFromId, referenceMatchesKinds } from "../shared/reference-utils.js";

const DEFAULT_LIMIT = 50;

function safeString(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function safeLower(value) {
  return safeString(value).toLowerCase();
}

function nodeMapForGraph(graph) {
  return new Map((Array.isArray(graph?.nodes) ? graph.nodes : []).map(function (node) {
    return [node.id, node];
  }));
}

function resolveValueByType(node, key, type) {
  const value = node?.values?.[key];
  switch (type) {
    case "identity":
    case "text":
    case "color":
    case "select":
    case "reference":
      return value === null || value === undefined ? null : String(value);
    case "number":
      return Number.isFinite(Number(value)) ? Number(value) : null;
    case "boolean":
      return value === true;
    case "json":
    case "formula":
    case "tagQuery":
      return deepCloneJson(value);
    case "referenceList":
    case "tagList":
      return Array.isArray(value) ? value.map(function (entry) { return entry === null || entry === undefined ? null : String(entry); }).filter(Boolean) : [];
    case "localizedText":
      return value && typeof value === "object" ? deepCloneJson(value) : null;
    default:
      return deepCloneJson(value);
  }
}

function specForNodeType(type) {
  switch (type) {
    case "game_project_settings":
      return { kind: "projectSettings", identityField: "projectId", labelField: "gameName" };
    case "chunk_grid_definition":
      return { kind: "chunkGrid", identityField: "gridId", labelField: "gridId" };
    case "constant_value":
      return { kind: "value", identityField: "valueId", labelField: "valueId" };
    case "global_value_definition":
      return { kind: "globalValue", identityField: "valueId", labelField: "label" };
    case "tag_definition":
      return { kind: "tagDefinition", identityField: "tagId", labelField: "label" };
    case "text_template":
      return { kind: "textTemplate", identityField: "templateId", labelField: "label" };
    case "localization_entry":
      return { kind: "localizedText", identityField: "localizationId", labelField: "language" };
    case "value_formula":
      return { kind: "valueFormula", identityField: "formulaId", labelField: "formulaId" };
    case "catalog_output":
      return { kind: "catalogPackage", identityField: "catalogId", labelField: "catalogId" };
    case "catalog_registry":
      return { kind: "catalogRegistry", identityField: "registryId", labelField: "registryId" };
    case "zone_registry":
      return { kind: "zoneRegistry", identityField: "registryId", labelField: "registryId" };
    case "zone_definition":
      return { kind: "zone", identityField: "zoneId", labelField: "displayName" };
    case "area_definition":
      return { kind: "area", identityField: "areaId", labelField: "label" };
    case "spawn_point":
      return { kind: "spawn", identityField: "spawnId", labelField: "label" };
    case "checkpoint":
      return { kind: "checkpoint", identityField: "checkpointId", labelField: "label" };
    case "zone_link":
      return { kind: "zone_link", identityField: "linkId", labelField: "linkId" };
    case "location_anchor":
      return { kind: "target", identityField: "anchorId", labelField: "label" };
    case "map_marker_definition":
      return { kind: "marker", identityField: "markerId", labelField: "label" };
    case "minimap_bake":
      return { kind: "minimap", identityField: "minimapId", labelField: "label" };
    case "entity_assembly":
    case "model_entity":
      return { kind: "entity", identityField: "entityId", labelField: "label" };
    case "interaction_component":
      return { kind: "entity_component", identityField: "componentId", labelField: "interactionType" };
    case "quest_target_binding":
      return { kind: "target", identityField: "targetId", labelField: "label" };
    case "area_output":
      return { kind: "areaPackage", identityField: "packageId", labelField: "packageId" };
    case "zone_output":
      return { kind: "zonePackage", identityField: "packageId", labelField: "packageId" };
    case "campaign_registry":
      return { kind: "campaignRegistry", identityField: "registryId", labelField: "registryId" };
    case "player_rules_output":
      return { kind: "playerRules", identityField: "rulesId", labelField: "rulesId" };
    case "ui_output":
      return { kind: "uiPackage", identityField: "uiId", labelField: "uiId" };
    case "legacy_world_adapter":
      return { kind: "legacyWorld", identityField: "adapterId", labelField: "adapterId" };
    case "world_assembly":
      return { kind: "gameProject", identityField: "assemblyId", labelField: "assemblyId" };
    case "group":
      return { kind: "group", identityField: "groupId", labelField: "title" };
    default:
      return null;
  }
}

function buildProperties(node) {
  const properties = {};
  const definition = NODE_TYPES[node.type] || { fields: {} };
  for (const [key, field] of Object.entries(definition.fields || {})) {
    properties[key] = {
      valueType: field.type || "text",
      tokenSafe: field.type === "tokenText"
        || field.type === "identity"
        || field.type === "reference"
        || field.type === "referenceList"
        || field.type === "tagList"
        || field.type === "tagQuery"
        || field.type === "localizedText"
        || field.type === "formula"
        || field.type === "text"
    };
  }
  return properties;
}

function buildAliases(node) {
  const aliases = [];
  const rawAliases = node?.values?.aliases;
  for (const alias of Array.isArray(rawAliases) ? rawAliases : []) {
    const normalized = normalizeCanonicalId(alias, "");
    if (normalized && !aliases.includes(normalized)) aliases.push(normalized);
  }
  return aliases;
}

function buildTags(node) {
  const tags = normalizeTagList(node?.values?.tags);
  if (node.type === "group") {
    const kind = safeLower(node?.values?.groupKind || "generic");
    if (kind) tags.push("group." + kind);
  }
  return Array.from(new Set(tags));
}

function nodeLabel(node) {
  return safeString(
    node?.values?.label
    || node?.values?.gameName
    || node?.values?.title
    || node?.title
    || node?.id
    || node?.type
  );
}

function nodeIdForRecord(node, spec) {
  const field = spec?.identityField;
  if (!field) return "";
  return normalizeCanonicalId(node?.values?.[field], "");
}

function buildValue(node, spec) {
  switch (node.type) {
    case "game_project_settings":
      return {
        projectId: node.values.projectId || null,
        gameName: node.values.gameName || null,
        defaultLanguage: node.values.defaultLanguage || null,
        contentVersion: node.values.contentVersion || null,
        startZoneRef: node.values.startZoneRef || null,
        startSpawnRef: node.values.startSpawnRef || null,
        allowLegacyWorld: node.values.allowLegacyWorld !== false
      };
    case "chunk_grid_definition":
      return {
        gridId: node.values.gridId || null,
        chunkWidth: Number(node.values.chunkWidth) || 0,
        chunkDepth: Number(node.values.chunkDepth) || 0,
        tileSize: Number(node.values.tileSize) || 0,
        maxLoadedChunks: Number(node.values.maxLoadedChunks) || 0,
        maxWindowWidth: Number(node.values.maxWindowWidth) || 0,
        maxWindowDepth: Number(node.values.maxWindowDepth) || 0,
        originX: Number(node.values.originX) || 0,
        originZ: Number(node.values.originZ) || 0,
        edgeMode: node.values.edgeMode || null
      };
    case "constant_value":
      return {
        valueId: node.values.valueId || null,
        valueType: node.values.valueType || "text",
        value: resolveValueByType(node, node.values.valueType === "text" ? "textValue" : (
          node.values.valueType === "number" ? "numberValue" : (
            node.values.valueType === "boolean" ? "booleanValue" : (
              node.values.valueType === "color" ? "colorValue" : (
                node.values.valueType === "reference" ? "referenceValue" : "jsonValue"
              )
            )
          )
        ), node.values.valueType),
        text: safeString(resolveValueByType(node, node.values.valueType === "text" ? "textValue" : (
          node.values.valueType === "number" ? "numberValue" : (
            node.values.valueType === "boolean" ? "booleanValue" : (
              node.values.valueType === "color" ? "colorValue" : (
                node.values.valueType === "reference" ? "referenceValue" : "jsonValue"
              )
            )
          )
        ), node.values.valueType))
      };
    case "global_value_definition":
      const rawGlobalValue = resolveValueByType(node, node.values.valueType === "text" ? "textValue" : (
        node.values.valueType === "number" ? "numberValue" : (
          node.values.valueType === "boolean" ? "booleanValue" : (
            node.values.valueType === "color" ? "colorValue" : "referenceValue"
          )
        )
      ), node.values.valueType);
      return {
        valueId: node.values.valueId || null,
        valueType: node.values.valueType || "text",
        value: rawGlobalValue,
        text: safeString(rawGlobalValue),
        format: node.values.format || "raw",
        label: node.values.label || null,
        description: node.values.description || "",
        tags: normalizeTagList(node.values.tags)
      };
    case "tag_definition":
      return {
        tagId: node.values.tagId || null,
        label: node.values.label || null,
        description: node.values.description || "",
        parentTagRef: node.values.parentTagRef || null,
        allowedKinds: Array.isArray(node.values.allowedKinds) ? node.values.allowedKinds.slice() : [],
        restricted: node.values.restricted === true,
        owner: node.values.owner || ""
      };
    case "text_template":
      return {
        templateId: node.values.templateId || null,
        label: node.values.label || null,
        text: node.values.text || "",
        contextKinds: Array.isArray(node.values.contextKinds) ? node.values.contextKinds.slice() : [],
        fallbackText: node.values.fallbackText || "",
        maxRenderedLength: Number(node.values.maxRenderedLength) || 0
      };
    case "localization_entry":
      return {
        localizationId: node.values.localizationId || null,
        language: node.values.language || null,
        text: node.values.text || "",
        fallbackText: node.values.fallbackText || ""
      };
    case "value_formula":
      return {
        formulaId: node.values.formulaId || null,
        resultType: node.values.resultType || "number",
        expressionJson: deepCloneJson(node.values.expressionJson),
        roundMode: node.values.roundMode || "none",
        clampMin: node.values.clampMin ?? null,
        clampMax: node.values.clampMax ?? null
      };
    default:
      return deepCloneJson(node.values);
  }
}

function buildRecord(node, nodeMap, aliasLookup) {
  const spec = specForNodeType(node.type);
  if (!spec) return null;
  const id = nodeIdForRecord(node, spec);
  if (!id) {
    return {
      error: {
        code: "SYMBOL_INVALID_ID",
        message: "Node " + node.id + " heeft geen geldig id in field " + spec.identityField + ".",
        nodeId: node.id
      }
    };
  }
  const aliases = buildAliases(node);
  const extraAliases = aliasLookup.get(id) || [];
  for (const alias of extraAliases) {
    if (!aliases.includes(alias)) aliases.push(alias);
  }
  return {
    id,
    kind: spec.kind,
    nodeId: node.id,
    parentId: node.parentId || null,
    label: nodeLabel(node),
    value: buildValue(node, spec),
    properties: buildProperties(node),
    tags: buildTags(node),
    published: false,
    aliases,
    nodeType: node.type,
    groupKind: node.type === "group" ? safeLower(node.values?.groupKind || "generic") : null
  };
}

function aliasLookupForGraph(graph) {
  const lookup = new Map();
  for (const aliasRow of Array.isArray(graph?.contentAliases) ? graph.contentAliases : []) {
    const oldId = normalizeCanonicalId(aliasRow?.old_id, "");
    const newId = normalizeCanonicalId(aliasRow?.new_id, "");
    if (!oldId || !newId) continue;
    const current = lookup.get(newId) || [];
    if (!current.includes(oldId)) current.push(oldId);
    lookup.set(newId, current);
  }
  return lookup;
}

export function buildSymbolIndex(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const nodeMap = nodeMapForGraph(graph);
  const aliasLookup = aliasLookupForGraph(graph);
  const byId = new Map();
  const aliases = new Map();
  const records = [];
  const errors = [];
  const warnings = [];

  for (const node of nodes) {
    const record = buildRecord(node, nodeMap, aliasLookup);
    if (!record) continue;
    if (record.error) {
      errors.push(record.error);
      continue;
    }
    if (byId.has(record.id)) {
      errors.push({
        code: "SYMBOL_DUPLICATE_ID",
        message: "Dubbele symbol id: " + record.id + ".",
        nodeId: node.id,
        referenceId: record.id
      });
      continue;
    }
    byId.set(record.id, record);
    records.push(record);
    for (const alias of record.aliases) {
      if (aliases.has(alias) && aliases.get(alias) !== record.id) {
        warnings.push({
          code: "SYMBOL_DUPLICATE_ID",
          message: "Alias " + alias + " verwijst al naar " + aliases.get(alias) + ".",
          nodeId: node.id,
          referenceId: alias
        });
        continue;
      }
      aliases.set(alias, record.id);
    }
  }

  return {
    byId,
    aliases,
    records,
    errors,
    warnings,
    graphRevision: Number(graph?.graphRevision || 0),
    contentSchemaVersion: String(graph?.contentSchemaVersion || NODE_CONTRACT_VERSION)
  };
}

export function serializeSymbolIndex(index) {
  const byId = {};
  for (const [id, record] of index?.byId instanceof Map ? index.byId.entries() : []) {
    byId[id] = record;
  }
  const aliases = {};
  for (const [alias, canonicalId] of index?.aliases instanceof Map ? index.aliases.entries() : []) {
    aliases[alias] = canonicalId;
  }
  return {
    graphRevision: Number(index?.graphRevision || 0),
    contentSchemaVersion: String(index?.contentSchemaVersion || NODE_CONTRACT_VERSION),
    byId,
    aliases,
    records: Array.isArray(index?.records) ? index.records.slice() : [],
    errors: Array.isArray(index?.errors) ? index.errors.slice() : [],
    warnings: Array.isArray(index?.warnings) ? index.warnings.slice() : []
  };
}

export function validateReferencesAgainstIndex(index, references = []) {
  const errors = [];
  const validated = [];
  for (const reference of Array.isArray(references) ? references : []) {
    const id = normalizeCanonicalId(reference?.id, "");
    const expectedKinds = Array.isArray(reference?.expectedKinds)
      ? reference.expectedKinds.map(normalizeReferenceKind).filter(Boolean)
      : [];
    if (!id) {
      errors.push({
        code: "REFERENCE_MISSING",
        severity: "error",
        message: "Reference mist een geldig id.",
        referenceId: reference?.id || null,
        field: reference?.field || null,
        nodeId: reference?.nodeId || null,
        fixHint: "Open de @ picker en kies een geldige reference."
      });
      continue;
    }
    const directSymbol = index?.byId instanceof Map ? index.byId.get(id) : null;
    const aliasTarget = index?.aliases instanceof Map ? index.aliases.get(id) : null;
    const resolvedSymbol = directSymbol || (aliasTarget && index?.byId instanceof Map ? index.byId.get(aliasTarget) : null) || null;
    if (!resolvedSymbol) {
      errors.push({
        code: "REFERENCE_MISSING",
        severity: "error",
        message: "Onbekende reference: " + id + ".",
        referenceId: id,
        field: reference?.field || null,
        nodeId: reference?.nodeId || null,
        fixHint: "Kies een bestaande symbol uit de picker."
      });
      continue;
    }
    if (expectedKinds.length && !referenceMatchesKinds(resolvedSymbol.id, expectedKinds)) {
      errors.push({
        code: "REFERENCE_WRONG_KIND",
        severity: "error",
        message: "Reference " + id + " heeft kind " + resolvedSymbol.kind + " maar verwacht " + expectedKinds.join(", ") + ".",
        referenceId: id,
        field: reference?.field || null,
        nodeId: reference?.nodeId || null,
        fixHint: "Kies een reference van kind " + expectedKinds.join(", ") + "."
      });
      continue;
    }
    validated.push({
      id,
      kind: resolvedSymbol.kind,
      nodeId: resolvedSymbol.nodeId,
      label: resolvedSymbol.label,
      symbol: resolvedSymbol
    });
  }
  return {
    graphRevision: Number(index?.graphRevision || 0),
    contentSchemaVersion: String(index?.contentSchemaVersion || NODE_CONTRACT_VERSION),
    validated,
    errors,
    warnings: Array.isArray(index?.warnings) ? index.warnings.slice() : []
  };
}

export class SymbolIndexService {
  constructor() {
    this.cache = {
      graphRevision: null,
      nodeCount: 0,
      index: null
    };
  }

  invalidate() {
    this.cache = {
      graphRevision: null,
      nodeCount: 0,
      index: null
    };
  }

  getIndex(graph) {
    const graphRevision = Number(graph?.graphRevision || 0);
    const nodeCount = Array.isArray(graph?.nodes) ? graph.nodes.length : 0;
    if (this.cache.index && this.cache.graphRevision === graphRevision && this.cache.nodeCount === nodeCount) {
      return this.cache.index;
    }
    const index = buildSymbolIndex(graph);
    this.cache = { graphRevision, nodeCount, index };
    return index;
  }

  lookup(graph, id) {
    const index = this.getIndex(graph);
    const canonical = normalizeCanonicalId(id, "");
    if (!canonical) return null;
    return index.byId.get(canonical) || (index.aliases.has(canonical) ? index.byId.get(index.aliases.get(canonical)) : null) || null;
  }

  search(graph, options = {}) {
    const index = this.getIndex(graph);
    const query = safeLower(options.q || options.query || "");
    const kind = normalizeReferenceKind(options.kind || "");
    const parentId = normalizeCanonicalId(options.parentId || "", "");
    const limit = Math.max(1, Math.min(200, Math.floor(Number(options.limit) || DEFAULT_LIMIT)));
    const includeProperties = options.includeProperties === true;
    const symbols = index.records.filter(function (symbol) {
      if (kind && normalizeReferenceKind(symbol.kind) !== kind) return false;
      if (parentId && symbol.parentId !== parentId) return false;
      if (!query) return true;
      return buildReferenceSearchTerms(symbol).some(function (term) {
        return String(term || "").toLowerCase().includes(query);
      });
    }).sort(function (left, right) {
      const leftLabel = safeLower(left.label || left.id);
      const rightLabel = safeLower(right.label || right.id);
      if (leftLabel !== rightLabel) return leftLabel < rightLabel ? -1 : 1;
      return String(left.id).localeCompare(String(right.id));
    }).slice(0, limit).map(function (symbol) {
      if (includeProperties) return deepCloneJson(symbol);
      return {
        id: symbol.id,
        kind: symbol.kind,
        nodeId: symbol.nodeId,
        parentId: symbol.parentId,
        label: symbol.label,
        tags: Array.isArray(symbol.tags) ? symbol.tags.slice() : [],
        aliases: Array.isArray(symbol.aliases) ? symbol.aliases.slice() : [],
        published: symbol.published === true,
        nodeType: symbol.nodeType,
        groupKind: symbol.groupKind
      };
    });
    return {
      graphRevision: index.graphRevision,
      contentSchemaVersion: index.contentSchemaVersion,
      symbols,
      errors: index.errors.slice(),
      warnings: index.warnings.slice()
    };
  }

  validateReferences(graph, references = []) {
    return validateReferencesAgainstIndex(this.getIndex(graph), references);
  }

  getPlainIndex(graph) {
    return serializeSymbolIndex(this.getIndex(graph));
  }
}

export { NODE_CONTRACT_VERSION };
