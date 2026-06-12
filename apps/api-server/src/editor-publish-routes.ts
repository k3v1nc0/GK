import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createPublishInputBundle,
  createPublishSnapshotMetadata,
  createRollbackSnapshotReference,
  validatePublishInputBundle,
  validatePublishRollbackReference,
  validatePublishSnapshotMetadata,
  type PublishInputBundle,
  type PublishRollbackSnapshotReference,
  type PublishSnapshotMetadata,
  type PublishValidationResult
} from "@gk/schemas";

import type { SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_PUBLISH_ROUTE_IDS = {
  status: "editor.publish.status",
  validate: "editor.publish.validate",
  snapshotsCreate: "editor.publish.snapshots.create",
  snapshotsList: "editor.publish.snapshots.list",
  snapshotRead: "editor.publish.snapshots.read",
  rollbackValidate: "editor.publish.rollback.validate"
} as const;

export type EditorPublishRouteId = (typeof EDITOR_PUBLISH_ROUTE_IDS)[keyof typeof EDITOR_PUBLISH_ROUTE_IDS];
export type EditorPublishHttpMethod = "GET" | "POST";

export interface EditorPublishRouteDefinition {
  readonly id: EditorPublishRouteId;
  readonly method: EditorPublishHttpMethod;
  readonly path: string;
  readonly public: false;
  readonly requiredScope: "editor";
  readonly requiredEditorRole: "editor_admin";
  readonly stateChanging: boolean;
  readonly requiresCsrf: boolean;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
  readonly containsConcreteGameContent: false;
}

export type EditorPublishAuthorizationResult =
  | { readonly allowed: true; readonly editorUserId: string | null }
  | { readonly allowed: false; readonly reason: "missing_session" | "wrong_scope" | "missing_role" };

export interface EditorPublishAccess {
  readonly allowed: boolean;
  readonly result: EditorPublishAuthorizationResult;
  readonly requiresScope: "editor";
  readonly requiresEditorRole: "editor_admin";
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorPublishStatusResponse {
  readonly ok: true;
  readonly phase: "phase-10";
  readonly status: "git-basis";
  readonly serverSideValidated: false;
  readonly runtimePublishAvailable: false;
  readonly automaticPublishEnabled: false;
  readonly snapshotMetadataOnly: true;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
  readonly containsConcreteGameContent: false;
}

export interface EditorPublishValidationResponse {
  readonly ok: true;
  readonly validation: PublishValidationResult;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorPublishSnapshotCreateResponse {
  readonly ok: true;
  readonly snapshot: PublishSnapshotMetadata;
  readonly validation: PublishValidationResult;
  readonly snapshotMetadataOnly: true;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorPublishSnapshotsListResponse {
  readonly ok: true;
  readonly snapshots: readonly PublishSnapshotMetadata[];
  readonly snapshotMetadataOnly: true;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorPublishSnapshotReadResponse {
  readonly ok: true;
  readonly snapshotId: string;
  readonly snapshot: PublishSnapshotMetadata | null;
  readonly snapshotMetadataOnly: true;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorPublishRollbackValidationResponse {
  readonly ok: true;
  readonly rollback: PublishRollbackSnapshotReference;
  readonly issues: ReturnType<typeof validatePublishRollbackReference>;
  readonly validForRollbackRequest: boolean;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export const EDITOR_PUBLISH_ROUTE_DEFINITIONS: readonly EditorPublishRouteDefinition[] = [
  route(EDITOR_PUBLISH_ROUTE_IDS.status, "GET", "/editor/publish/status", false),
  route(EDITOR_PUBLISH_ROUTE_IDS.validate, "POST", "/editor/publish/validate", true),
  route(EDITOR_PUBLISH_ROUTE_IDS.snapshotsCreate, "POST", "/editor/publish/snapshots", true),
  route(EDITOR_PUBLISH_ROUTE_IDS.snapshotsList, "GET", "/editor/publish/snapshots", false),
  route(EDITOR_PUBLISH_ROUTE_IDS.snapshotRead, "GET", "/editor/publish/snapshots/:id", false),
  route(EDITOR_PUBLISH_ROUTE_IDS.rollbackValidate, "POST", "/editor/publish/rollback/validate", true)
] as const;

export function authorizeEditorPublishAccess(
  routeId: EditorPublishRouteId,
  session?: SessionContext | null
): EditorPublishAccess {
  const result = authorizeEditorPublishSession(session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    requiresEditorRole: "editor_admin",
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function authorizeEditorPublishSession(session?: SessionContext | null): EditorPublishAuthorizationResult {
  if (!session) {
    return { allowed: false, reason: "missing_session" };
  }

  if (session.scope !== "editor") {
    return { allowed: false, reason: "wrong_scope" };
  }

  if (!session.editorRoles?.includes("editor_admin")) {
    return { allowed: false, reason: "missing_role" };
  }

  return { allowed: true, editorUserId: session.editorUserId ?? null };
}

export function createEditorPublishStatusResponse(): EditorPublishStatusResponse {
  return {
    ok: true,
    phase: "phase-10",
    status: "git-basis",
    serverSideValidated: false,
    runtimePublishAvailable: false,
    automaticPublishEnabled: false,
    snapshotMetadataOnly: true,
    publishesRuntimeOutput: false,
    modifiesAssets: false,
    containsConcreteGameContent: false
  };
}

export function createEditorPublishValidationResponse(bundle: PublishInputBundle): EditorPublishValidationResponse {
  return {
    ok: true,
    validation: validatePublishInputBundle(bundle),
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function createEditorPublishSnapshotCreateResponse(
  bundle: PublishInputBundle,
  session: SessionContext | null,
  now: Date = new Date()
): EditorPublishSnapshotCreateResponse {
  const validation = validatePublishInputBundle(bundle);
  const snapshot = createPublishSnapshotMetadata({
    sourceBundleId: bundle.bundleId,
    createdAt: now.toISOString(),
    createdByEditorUserId: session?.editorUserId ?? null,
    validationResultId: validation.validationId,
    candidateSummary: validation.candidateSummary
  });
  const snapshotIssues = validatePublishSnapshotMetadata(snapshot);

  if (!validation.snapshotAllowed || snapshotIssues.some((issue) => issue.severity === "error")) {
    throw new Error("publish_validation_failed");
  }

  return {
    ok: true,
    snapshot,
    validation,
    snapshotMetadataOnly: true,
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function createEditorPublishSnapshotsListResponse(): EditorPublishSnapshotsListResponse {
  return {
    ok: true,
    snapshots: [],
    snapshotMetadataOnly: true,
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function createEditorPublishSnapshotReadResponse(snapshotId: string): EditorPublishSnapshotReadResponse {
  return {
    ok: true,
    snapshotId,
    snapshot: null,
    snapshotMetadataOnly: true,
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function createEditorPublishRollbackValidationResponse(
  rollback: PublishRollbackSnapshotReference
): EditorPublishRollbackValidationResponse {
  const issues = validatePublishRollbackReference(rollback);

  return {
    ok: true,
    rollback,
    issues,
    validForRollbackRequest: !issues.some((issue) => issue.severity === "error"),
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export async function handleEditorPublishHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/publish/status") {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.status, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorPublishStatusResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/publish/snapshots") {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.snapshotsList, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorPublishSnapshotsListResponse());
    return true;
  }

  const snapshotMatch = request.method === "GET"
    ? /^\/editor\/publish\/snapshots\/([^/]+)$/.exec(url.pathname)
    : null;
  if (snapshotMatch) {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.snapshotRead, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorPublishSnapshotReadResponse(decodeURIComponent(snapshotMatch[1] ?? "")));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/publish/validate") {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.validate, session);
    if (!await validatePublishWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 512_000);
      sendJson(response, 200, createEditorPublishValidationResponse(readPublishBundle(body)));
    } catch (error) {
      sendJson(response, errorStatus(error), { ok: false, error: safePublishError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/publish/snapshots") {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.snapshotsCreate, session);
    if (!await validatePublishWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 512_000);
      sendJson(response, 201, createEditorPublishSnapshotCreateResponse(readPublishBundle(body), session));
    } catch (error) {
      sendJson(response, errorStatus(error), { ok: false, error: safePublishError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/publish/rollback/validate") {
    const access = authorizeEditorPublishAccess(EDITOR_PUBLISH_ROUTE_IDS.rollbackValidate, session);
    if (!await validatePublishWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 64_000);
      sendJson(response, 200, createEditorPublishRollbackValidationResponse(readRollbackReference(body)));
    } catch (error) {
      sendJson(response, errorStatus(error), { ok: false, error: safePublishError(error) });
    }
    return true;
  }

  return false;
}

async function validatePublishWriteAccess(
  request: IncomingMessage,
  response: ServerResponse,
  access: EditorPublishAccess
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

function readPublishBundle(body: unknown): PublishInputBundle {
  const candidate = body as { readonly bundle?: unknown } | null;
  if (!candidate?.bundle || typeof candidate.bundle !== "object") {
    throw new Error("invalid_publish_bundle");
  }

  return candidate.bundle as PublishInputBundle;
}

function readRollbackReference(body: unknown): PublishRollbackSnapshotReference {
  const candidate = body as { readonly rollback?: unknown; readonly snapshotId?: unknown } | null;
  if (candidate?.rollback && typeof candidate.rollback === "object") {
    return candidate.rollback as PublishRollbackSnapshotReference;
  }

  if (typeof candidate?.snapshotId === "string") {
    return createRollbackSnapshotReference({
      rollbackReferenceId: `rollback:${candidate.snapshotId}`,
      targetSnapshotId: candidate.snapshotId
    });
  }

  throw new Error("invalid_publish_rollback");
}

function sendAccessDenied(response: ServerResponse, result: EditorPublishAuthorizationResult): void {
  sendJson(response, accessStatus(result), { ok: false, error: accessError(result) });
}

function accessStatus(result: EditorPublishAuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: EditorPublishAuthorizationResult): string {
  if (result.allowed) {
    return "ok";
  }

  return result.reason === "missing_session"
    ? "editor_session_required"
    : result.reason === "missing_role" ? "editor_admin_required" : "editor_scope_required";
}

function route(
  id: EditorPublishRouteId,
  method: EditorPublishHttpMethod,
  path: string,
  stateChanging: boolean
): EditorPublishRouteDefinition {
  return {
    id,
    method,
    path,
    public: false,
    requiredScope: "editor",
    requiredEditorRole: "editor_admin",
    stateChanging,
    requiresCsrf: stateChanging,
    publishesRuntimeOutput: false,
    modifiesAssets: false,
    containsConcreteGameContent: false
  };
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message === "publish_validation_failed" ? 422 : 400;
}

function safePublishError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "invalid_publish_bundle",
    "invalid_publish_rollback",
    "publish_validation_failed",
    "request_body_too_large",
    "request_body_required",
    "invalid_json"
  ]);
  return safeCodes.has(code) ? code : "editor_publish_request_failed";
}

export const EMPTY_PUBLISH_INPUT_BUNDLE = createPublishInputBundle({ bundleId: "editor-publish-empty-draft" });
