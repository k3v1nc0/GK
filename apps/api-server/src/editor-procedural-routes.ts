import type { IncomingMessage, ServerResponse } from "node:http";

import { createDeterministicSequence } from "@gk/node-engine";
import {
  createEmptyGenerationOutput,
  createGenerationBakeDraftResult,
  createGenerationPreviewResult,
  createProceduralGraphDraft,
  normalizeProceduralSeed,
  validateGenerationBakeDraftResult,
  validateGenerationPreviewResult,
  validateProceduralGraphDraft,
  type GenerationBakeDraftResult,
  type GenerationPreviewResult,
  type GenerationValidationIssue,
  type ProceduralAssetRecordGate,
  type ProceduralGraphDraft,
  type ProceduralValidationOptions
} from "@gk/schemas";

import { authorizeRequest, type AuthorizationResult, type SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_PROCEDURAL_ROUTE_IDS = {
  graph: "editor.procedural.graph",
  validate: "editor.procedural.validate",
  preview: "editor.procedural.preview",
  bakeDraft: "editor.procedural.bake_draft",
  generated: "editor.procedural.generated",
  issues: "editor.procedural.issues"
} as const;

export interface EditorProceduralAccess {
  readonly allowed: boolean;
  readonly result: AuthorizationResult;
  readonly requiresScope: "editor";
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralGraphResponse {
  readonly ok: true;
  readonly graph: ProceduralGraphDraft;
  readonly requiresSeed: true;
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralValidationResponse {
  readonly ok: true;
  readonly issues: readonly GenerationValidationIssue[];
  readonly validForPreview: boolean;
  readonly validForBakeDraft: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralPreviewResponse {
  readonly ok: true;
  readonly preview: GenerationPreviewResult;
  readonly deterministicSignature: string;
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralBakeDraftResponse {
  readonly ok: true;
  readonly bakeDraft: GenerationBakeDraftResult;
  readonly writesEditorDraftData: true;
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralGeneratedResponse {
  readonly ok: true;
  readonly generatedEntities: readonly never[];
  readonly generatedGroups: readonly never[];
  readonly placementCandidates: readonly never[];
  readonly spawnAreaCandidates: readonly never[];
  readonly pathNetworkCandidates: readonly never[];
  readonly resourceDistributionCandidates: readonly never[];
  readonly audioCandidates: readonly never[];
  readonly publishesRuntimeOutput: false;
}

export interface EditorProceduralIssuesResponse {
  readonly ok: true;
  readonly issues: readonly GenerationValidationIssue[];
  readonly publishesRuntimeOutput: false;
}

export function authorizeEditorProceduralAccess(
  routeId: (typeof EDITOR_PROCEDURAL_ROUTE_IDS)[keyof typeof EDITOR_PROCEDURAL_ROUTE_IDS],
  session?: SessionContext | null
): EditorProceduralAccess {
  const result = authorizeRequest(routeId, session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralGraphResponse(): EditorProceduralGraphResponse {
  return {
    ok: true,
    graph: createProceduralGraphDraft({ graphId: "editor-procedural-graph-draft" }),
    requiresSeed: true,
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralValidationResponse(
  graph: ProceduralGraphDraft
): EditorProceduralValidationResponse {
  const issues = validateProceduralGraphDraft(graph);

  return {
    ok: true,
    issues,
    validForPreview: !issues.some((candidate) => candidate.severity === "error"),
    validForBakeDraft: !issues.some((candidate) => candidate.blocksBake),
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralPreviewResponse(
  graph: ProceduralGraphDraft,
  options: ProceduralValidationOptions = {}
): EditorProceduralPreviewResponse {
  const graphIssues = validateProceduralGraphDraft(graph);
  const deterministicSignature = createDeterministicSignature(graph);
  const output = createEmptyGenerationOutput({ graph, deterministicSignature, issues: graphIssues });
  const preview = createGenerationPreviewResult(output, graphIssues);
  const issues = validateGenerationPreviewResult(preview, options);

  return {
    ok: true,
    preview: {
      ...preview,
      issues,
      valid: !issues.some((candidate) => candidate.severity === "error")
    },
    deterministicSignature,
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralBakeDraftResponse(
  graph: ProceduralGraphDraft,
  options: ProceduralValidationOptions = {}
): EditorProceduralBakeDraftResponse {
  const preview = createEditorProceduralPreviewResponse(graph, options);
  const bakeDraft = createGenerationBakeDraftResult(preview.preview.output, preview.preview.issues);
  const issues = validateGenerationBakeDraftResult(bakeDraft, options);

  return {
    ok: true,
    bakeDraft: {
      ...bakeDraft,
      issues,
      valid: !issues.some((candidate) => candidate.blocksBake)
    },
    writesEditorDraftData: true,
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralGeneratedResponse(): EditorProceduralGeneratedResponse {
  return {
    ok: true,
    generatedEntities: [],
    generatedGroups: [],
    placementCandidates: [],
    spawnAreaCandidates: [],
    pathNetworkCandidates: [],
    resourceDistributionCandidates: [],
    audioCandidates: [],
    publishesRuntimeOutput: false
  };
}

export function createEditorProceduralIssuesResponse(): EditorProceduralIssuesResponse {
  return {
    ok: true,
    issues: [],
    publishesRuntimeOutput: false
  };
}

export async function handleEditorProceduralHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/procedural/graph") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.graph, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorProceduralGraphResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/procedural/generated") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.generated, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorProceduralGeneratedResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/procedural/issues") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.issues, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorProceduralIssuesResponse());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/procedural/validate") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.validate, session);
    if (!await validateProceduralWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorProceduralValidationResponse(readProceduralGraph(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeProceduralError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/procedural/preview") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.preview, session);
    if (!await validateProceduralWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorProceduralPreviewResponse(readProceduralGraph(body), readProceduralOptions(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeProceduralError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/procedural/bake-draft") {
    const access = authorizeEditorProceduralAccess(EDITOR_PROCEDURAL_ROUTE_IDS.bakeDraft, session);
    if (!await validateProceduralWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorProceduralBakeDraftResponse(readProceduralGraph(body), readProceduralOptions(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeProceduralError(error) });
    }
    return true;
  }

  return false;
}

async function validateProceduralWriteAccess(
  request: IncomingMessage,
  response: ServerResponse,
  access: EditorProceduralAccess
): Promise<boolean> {
  const policy = validateStateChangingRequest(request, { requireCsrf: true });

  if (!access.allowed || !policy.allowed) {
    sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
      ok: false,
      error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
    });
    return false;
  }

  return true;
}

function readProceduralGraph(body: unknown): ProceduralGraphDraft {
  const candidate = body as { readonly graph?: unknown } | null;
  if (!candidate?.graph || typeof candidate.graph !== "object") {
    throw new Error("invalid_procedural_graph");
  }

  return candidate.graph as ProceduralGraphDraft;
}

function readProceduralOptions(body: unknown): ProceduralValidationOptions {
  const candidate = body as {
    readonly validation?: {
      readonly audioCount?: unknown;
      readonly assetRecords?: unknown;
    };
  } | null;
  const audioCount = candidate?.validation?.audioCount;
  const assetRecords = candidate?.validation?.assetRecords;

  return {
    ...(typeof audioCount === "number" ? { audioCount } : {}),
    ...(Array.isArray(assetRecords) ? { assetRecords: assetRecords as readonly ProceduralAssetRecordGate[] } : {})
  };
}

function createDeterministicSignature(graph: ProceduralGraphDraft): string {
  const seed = graph.seed ? normalizeProceduralSeed(graph.seed.seed) : "";
  if (!seed) {
    return "seed-required";
  }

  const streamKey = stableStringify({
    graphId: graph.graphId,
    nodes: graph.nodes.map((node) => ({ id: node.nodeId, type: node.nodeType, config: node.config })),
    edges: graph.edges
  });
  return createDeterministicSequence({ seed, streamKey, count: 6 })
    .map((value) => value.toFixed(10))
    .join(":");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function sendAccessDenied(response: ServerResponse, result: AuthorizationResult): void {
  sendJson(response, accessStatus(result), { ok: false, error: accessError(result) });
}

function accessStatus(result: AuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: AuthorizationResult): string {
  return !result.allowed && result.reason === "missing_session" ? "editor_session_required" : "editor_scope_required";
}

function safeProceduralError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set(["invalid_procedural_graph", "request_body_too_large", "invalid_json"]);
  return safeCodes.has(code) ? code : "editor_procedural_request_failed";
}
