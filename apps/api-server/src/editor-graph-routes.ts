import type { IncomingMessage, ServerResponse } from "node:http";

import {
  applyGraphOperation,
  createDraftPreview,
  createEditorGraphSession,
  type GraphOperationResult
} from "@gk/node-engine";
import { getCoreGraphNodeTypes } from "@gk/node-types";
import type {
  DraftPreviewResult,
  EditorGraphDocument,
  EditorGraphOperation,
  EditorGraphSessionState
} from "@gk/schemas";

import { authorizeRequest, type AuthorizationResult, type SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_GRAPH_ROUTE_IDS = {
  draft: "editor.graph.draft",
  operation: "editor.graph.operation",
  preview: "editor.graph.preview"
} as const;

export interface EditorGraphAccess {
  readonly allowed: boolean;
  readonly result: AuthorizationResult;
  readonly requiresScope: "editor";
  readonly publishesRuntimeOutput: false;
}

export function authorizeEditorGraphAccess(
  routeId: (typeof EDITOR_GRAPH_ROUTE_IDS)[keyof typeof EDITOR_GRAPH_ROUTE_IDS],
  session?: SessionContext | null
): EditorGraphAccess {
  const result = authorizeRequest(routeId, session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    publishesRuntimeOutput: false
  };
}

export function createEditorGraphDraftResponse(): EditorGraphSessionState {
  return createEditorGraphSession();
}

export async function handleEditorGraphHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/graph/draft") {
    const access = authorizeEditorGraphAccess(EDITOR_GRAPH_ROUTE_IDS.draft, session);
    if (!access.allowed) {
      sendJson(response, accessStatus(access.result), { ok: false, error: accessError(access.result) });
      return true;
    }

    sendJson(response, 200, { ok: true, sessionState: createEditorGraphDraftResponse(), publishesRuntimeOutput: false });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/graph/operation") {
    const access = authorizeEditorGraphAccess(EDITOR_GRAPH_ROUTE_IDS.operation, session);
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!access.allowed || !policy.allowed) {
      sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
        ok: false,
        error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
      });
      return true;
    }

    try {
      const result = await createEditorGraphOperationResponse(request);
      sendJson(response, result.issues.length > 0 ? 400 : 200, { ok: result.issues.length === 0, ...result, publishesRuntimeOutput: false });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeGraphError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/graph/preview") {
    const access = authorizeEditorGraphAccess(EDITOR_GRAPH_ROUTE_IDS.preview, session);
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!access.allowed || !policy.allowed) {
      sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
        ok: false,
        error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
      });
      return true;
    }

    try {
      const preview = await createEditorGraphPreviewResponse(request);
      sendJson(response, 200, { ok: true, preview });
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeGraphError(error) });
    }
    return true;
  }

  return false;
}

export async function createEditorGraphOperationResponse(
  request: IncomingMessage
): Promise<GraphOperationResult> {
  const body = await readJsonBody(request, 128_000);
  const state = readSessionState(body);
  const operation = readOperation(body);

  return applyGraphOperation(state, operation, getCoreGraphNodeTypes());
}

export async function createEditorGraphPreviewResponse(
  request: IncomingMessage
): Promise<DraftPreviewResult> {
  const body = await readJsonBody(request, 128_000);
  const graph = readPreviewGraph(body);

  return createDraftPreview(graph, getCoreGraphNodeTypes());
}

function readSessionState(body: unknown): EditorGraphSessionState {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid_graph_request");
  }

  const candidate = body as { sessionState?: unknown };

  if (!candidate.sessionState || typeof candidate.sessionState !== "object") {
    throw new Error("invalid_graph_request");
  }

  return candidate.sessionState as EditorGraphSessionState;
}

function readOperation(body: unknown): EditorGraphOperation {
  const candidate = body as { operation?: unknown };

  if (!candidate.operation || typeof candidate.operation !== "object") {
    throw new Error("invalid_graph_operation");
  }

  return candidate.operation as EditorGraphOperation;
}

function readPreviewGraph(body: unknown): EditorGraphDocument {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("invalid_graph_preview");
  }

  const candidate = body as { graph?: unknown };

  if (!candidate.graph || typeof candidate.graph !== "object") {
    throw new Error("invalid_graph_preview");
  }

  return candidate.graph as EditorGraphDocument;
}

function accessStatus(result: AuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: AuthorizationResult): string {
  return !result.allowed && result.reason === "missing_session" ? "editor_session_required" : "editor_scope_required";
}

function safeGraphError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "invalid_graph_request",
    "invalid_graph_operation",
    "invalid_graph_preview",
    "request_body_too_large",
    "invalid_json"
  ]);

  return safeCodes.has(code) ? code : "editor_graph_request_failed";
}
