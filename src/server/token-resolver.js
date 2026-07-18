import { previewTokenText, resolveTokenText } from "../shared/token-contract.js";
import { serializeSymbolIndex, buildSymbolIndex } from "./symbol-index-service.js";
import { normalizeCanonicalId } from "../shared/node-contract.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function setDeepPath(target, path, value) {
  const segments = Array.isArray(path) ? path : [];
  if (!segments.length) return;
  let current = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!current[segment] || typeof current[segment] !== "object" || Array.isArray(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }
  current[segments[segments.length - 1]] = value;
}

function firstNodeOfType(graph, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find(function (node) {
    return node.type === type;
  }) || null;
}

function buildProjectContext(graph) {
  const node = firstNodeOfType(graph, "game_project_settings");
  if (!node) return null;
  return {
    id: normalizeCanonicalId(node.values?.projectId, ""),
    gameName: safeString(node.values?.gameName || ""),
    defaultLanguage: normalizeCanonicalId(node.values?.defaultLanguage, ""),
    contentVersion: safeString(node.values?.contentVersion || ""),
    startZoneRef: node.values?.startZoneRef || null,
    startSpawnRef: node.values?.startSpawnRef || null,
    allowLegacyWorld: node.values?.allowLegacyWorld !== false
  };
}

function buildStaticContext(graph, index) {
  const projectContext = buildProjectContext(graph) || {};
  const context = {
    global: {},
    project: projectContext,
    catalogs: {},
    zones: {},
    campaigns: {},
    playerRules: {},
    ui: {},
    tags: {},
    localization: {},
    values: {},
    symbols: {
      byId: serializeSymbolIndex(index).byId,
      aliases: serializeSymbolIndex(index).aliases
    }
  };

  for (const record of Array.isArray(index?.records) ? index.records : []) {
    const value = record?.value;
    switch (record.kind) {
      case "globalValue": {
        const path = String(record.id || "").split(".").filter(Boolean);
        if (path[0] === "global" && path.length >= 2) {
          setDeepPath(context, path, {
            id: record.id,
            label: record.label,
            value: value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")
              ? value.value
              : value,
            text: value && typeof value === "object" && typeof value.value !== "undefined"
              ? String(value.value)
              : safeString(value)
          });
        }
        break;
      }
      case "tagDefinition":
        if (record.id) context.tags[record.id] = value;
        break;
      case "textTemplate":
        if (record.id) context.catalogs.textTemplates = Object.assign(context.catalogs.textTemplates || {}, { [record.id]: value });
        break;
      case "localizedText":
        if (record.id) context.localization[record.id] = value;
        break;
      case "value":
        if (record.id) context.values[record.id] = value;
        break;
      case "projectSettings":
        context.project = Object.assign({}, context.project, value || {});
        break;
      default:
        break;
    }
  }

  if (projectContext.gameName) {
    const record = {
      id: "global.game_name",
      kind: "globalValue",
      label: "Game Name",
      value: {
        value: projectContext.gameName,
        text: projectContext.gameName
      }
    };
    context.global.game_name = {
      id: "global.game_name",
      label: "Game Name",
      value: projectContext.gameName,
      text: projectContext.gameName
    };
    if (context.symbols?.byId) context.symbols.byId["global.game_name"] = record;
  }

  return context;
}

export class TokenResolver {
  constructor(services = {}) {
    this.services = services;
  }

  buildContext(graph, options = {}) {
    const symbolIndexService = this.services.symbolIndexService;
    const index = options.symbolIndex || (symbolIndexService ? symbolIndexService.getIndex(graph) : buildSymbolIndex(graph));
    const staticContext = buildStaticContext(graph, index);
    const runtimeContext = options.sampleRuntimeContext && typeof options.sampleRuntimeContext === "object"
      ? options.sampleRuntimeContext
      : {};
    return {
      index,
      context: {
        static: staticContext,
        runtime: runtimeContext,
        symbols: staticContext.symbols,
        symbolIndex: serializeSymbolIndex(index)
      }
    };
  }

  preview(graph, text, options = {}) {
    const built = this.buildContext(graph, options);
    const context = built.context;
    const staticOnly = options.staticContextOnly !== false;
    const staticPreview = previewTokenText(text, {
      context,
      staticContextOnly: staticOnly,
      lookupSymbol: options.lookupSymbol
    });
    const runtimePreview = resolveTokenText(text, context, {
      staticContextOnly: false,
      lookupSymbol: options.lookupSymbol
    });
    return {
      text: staticPreview.text,
      staticPreview: staticPreview.text,
      runtimePreview: runtimePreview.text,
      segments: staticPreview.segments,
      errors: staticPreview.errors,
      warnings: runtimePreview.warnings,
      tokens: staticPreview.tokens,
      parsed: {
        segments: staticPreview.segments,
        errors: staticPreview.errors
      },
      contextSummary: {
        projectId: safeString(context.static?.project?.id || ""),
        globalKeys: Object.keys(context.static?.global || {})
      },
      symbolIndex: built.index
    };
  }
}

export function previewTokenTextForGraph(graph, text, options = {}) {
  const resolver = options.tokenResolver instanceof TokenResolver ? options.tokenResolver : new TokenResolver(options.services || {});
  return resolver.preview(graph, text, options);
}
