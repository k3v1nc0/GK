import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createRuntimeProjectionManifest,
  createRuntimeProjectionReadModel,
  createRuntimeProjectionSource,
  validateRuntimeProjectionManifest,
  validateRuntimeProjectionSource,
  type RuntimeProjectionManifest,
  type RuntimeProjectionReadModel,
  type RuntimeProjectionSource,
  type RuntimeProjectionValidationResult
} from "@gk/schemas";

import type { SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_RUNTIME_PROJECTION_ROUTE_IDS = {
  status: "editor.runtime_projection.status",
  validate: "editor.runtime_projection.validate",
  project: "editor.runtime_projection.project",
  manifestsList: "editor.runtime_projection.manifests.list",
  manifestRead: "editor.runtime_projection.manifests.read"
} as const;

export const RUNTIME_PROJECTION_ROUTE_IDS = {
  status: "runtime.projection.status",
  manifest: "runtime.projection.manifest",
  records: "runtime.projection.records"
} as const;

export type EditorRuntimeProjectionRouteId = (typeof EDITOR_RUNTIME_PROJECTION_ROUTE_IDS)[keyof typeof EDITOR_RUNTIME_PROJECTION_ROUTE_IDS];
export type RuntimeProjectionRouteId = (typeof RUNTIME_PROJECTION_ROUTE_IDS)[keyof typeof RUNTIME_PROJECTION_ROUTE_IDS];
export type RuntimeProjectionHttpMethod = "GET" | "POST";

export interface RuntimeProjectionRouteDefinition {
  readonly id: EditorRuntimeProjectionRouteId | RuntimeProjectionRouteId;
  readonly method: RuntimeProjectionHttpMethod;
  readonly path: string;
  readonly public: boolean;
  readonly requiredScope: "editor" | null;
  readonly requiredEditorRole: "editor_admin" | null;
  readonly stateChanging: boolean;
  readonly requiresCsrf: boolean;
  readonly readOnly: boolean;
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
  readonly containsConcreteGameContent: false;
  readonly leaksEditorDraftData: false;
}

export type RuntimeProjectionAuthorizationResult =
  | { readonly allowed: true; readonly editorUserId: string | null }
  | { readonly allowed: false; readonly reason: "missing_session" | "wrong_scope" | "missing_role" };

export interface RuntimeProjectionStatusResponse {
  readonly ok: true;
  readonly phase: "phase-11";
  readonly status: "git-basis";
  readonly serverSideValidated: false;
  readonly projectionAvailable: false;
  readonly runtimeRendererAvailable: false;
  readonly automaticProjectionEnabled: false;
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeProjectionValidationResponse {
  readonly ok: true;
  readonly validation: RuntimeProjectionValidationResult;
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
}

export interface RuntimeProjectionProjectResponse {
  readonly ok: true;
  readonly validation: RuntimeProjectionValidationResult;
  readonly manifest: RuntimeProjectionManifest;
  readonly readModel: RuntimeProjectionReadModel;
  readonly contractOnly: true;
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
  readonly containsConcreteGameContent: false;
}

export interface RuntimeProjectionManifestsResponse {
  readonly ok: true;
  readonly manifests: readonly RuntimeProjectionManifest[];
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
}

export interface RuntimeProjectionManifestReadResponse {
  readonly ok: true;
  readonly manifestId: string;
  readonly manifest: RuntimeProjectionManifest | null;
  readonly implementsRuntimeRenderer: false;
  readonly modifiesAssets: false;
}

export const EDITOR_RUNTIME_PROJECTION_ROUTE_DEFINITIONS: readonly RuntimeProjectionRouteDefinition[] = [
  route(EDITOR_RUNTIME_PROJECTION_ROUTE_IDS.status, "GET", "/editor/runtime-projection/status", false, false),
  route(EDITOR_RUNTIME_PROJECTION_ROUTE_IDS.validate, "POST", "/editor/runtime-projection/validate", true, false),
  route(EDITOR_RUNTIME_PROJECTION_ROUTE_IDS.project, "POST", "/editor/runtime-projection/project", true, false),
  route(EDITOR_RUNTIME_PROJECTION_ROUTE_IDS.manifestsList, "GET", "/editor/runtime-projection/manifests", false, false),
  route(EDITOR_RUNTIME_PROJECTION_ROUTE_IDS.manifestRead, "GET", "/editor/runtime-projection/manifests/:id", false, false)
] as const;

export const RUNTIME_PROJECTION_ROUTE_DEFINITIONS: readonly RuntimeProjectionRouteDefinition[] = [
  route(RUNTIME_PROJECTION_ROUTE_IDS.status, "GET", "/runtime/projection/status", false, true),
  route(RUNTIME_PROJECTION_ROUTE_IDS.manifest, "GET", "/runtime/projection/manifest", false, true),
  route(RUNTIME_PROJECTION_ROUTE_IDS.records, "GET", "/runtime/projection/records", false, true)
] as const;

export function authorizeRuntimeProjectionAdmin(session?: SessionContext | null): RuntimeProjectionAuthorizationResult {
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

export function createRuntimeProjectionStatusResponse(): RuntimeProjectionStatusResponse {
  return {
    ok: true,
    phase: "phase-11",
    status: "git-basis",
    serverSideValidated: false,
    projectionAvailable: false,
    runtimeRendererAvailable: false,
    automaticProjectionEnabled: false,
    implementsRuntimeRenderer: false,
    modifiesAssets: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeProjectionValidationResponse(source: RuntimeProjectionSource): RuntimeProjectionValidationResponse {
  return {
    ok: true,
    validation: validateRuntimeProjectionSource(source),
    implementsRuntimeRenderer: false,
    modifiesAssets: false
  };
}

export function createRuntimeProjectionProjectResponse(
  source: RuntimeProjectionSource,
  now: Date = new Date()
): RuntimeProjectionProjectResponse {
  const sourceValidation = validateRuntimeProjectionSource(source);

  if (!sourceValidation.valid) {
    throw new Error("runtime_projection_validation_failed");
  }

  const manifest = createRuntimeProjectionManifest({
    source,
    createdAt: now.toISOString(),
    records: []
  });
  const manifestValidation = validateRuntimeProjectionManifest(manifest);

  if (!manifestValidation.valid) {
    throw new Error("runtime_projection_manifest_invalid");
  }

  return {
    ok: true,
    validation: manifestValidation,
    manifest,
    readModel: createRuntimeProjectionReadModel({ manifest }),
    contractOnly: true,
    implementsRuntimeRenderer: false,
    modifiesAssets: false,
    containsConcreteGameContent: false
  };
}

export function createRuntimeProjectionManifestsResponse(): RuntimeProjectionManifestsResponse {
  return {
    ok: true,
    manifests: [],
    implementsRuntimeRenderer: false,
    modifiesAssets: false
  };
}

export function createRuntimeProjectionManifestReadResponse(manifestId: string): RuntimeProjectionManifestReadResponse {
  return {
    ok: true,
    manifestId,
    manifest: null,
    implementsRuntimeRenderer: false,
    modifiesAssets: false
  };
}

export function createRuntimeProjectionReadOnlyModel(): RuntimeProjectionReadModel {
  return createRuntimeProjectionReadModel();
}

export async function handleRuntimeProjectionHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/runtime/projection/status") {
    sendJson(response, 200, { ok: true, status: createRuntimeProjectionReadOnlyModel().status, emptyState: true, implementsRuntimeRenderer: false });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/runtime/projection/manifest") {
    const readModel = createRuntimeProjectionReadOnlyModel();
    sendJson(response, 200, { ok: true, manifest: readModel.manifest, emptyState: readModel.emptyState, leaksEditorDraftData: false });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/runtime/projection/records") {
    const readModel = createRuntimeProjectionReadOnlyModel();
    sendJson(response, 200, { ok: true, records: readModel.records, emptyState: readModel.emptyState, leaksEditorDraftData: false });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/runtime-projection/status") {
    const access = authorizeRuntimeProjectionAdmin(session);
    if (!access.allowed) {
      sendAccessDenied(response, access);
      return true;
    }

    sendJson(response, 200, createRuntimeProjectionStatusResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/runtime-projection/manifests") {
    const access = authorizeRuntimeProjectionAdmin(session);
    if (!access.allowed) {
      sendAccessDenied(response, access);
      return true;
    }

    sendJson(response, 200, createRuntimeProjectionManifestsResponse());
    return true;
  }

  const manifestMatch = request.method === "GET"
    ? /^\/editor\/runtime-projection\/manifests\/([^/]+)$/.exec(url.pathname)
    : null;
  if (manifestMatch) {
    const access = authorizeRuntimeProjectionAdmin(session);
    if (!access.allowed) {
      sendAccessDenied(response, access);
      return true;
    }

    sendJson(response, 200, createRuntimeProjectionManifestReadResponse(decodeURIComponent(manifestMatch[1] ?? "")));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/runtime-projection/validate") {
    const access = authorizeRuntimeProjectionAdmin(session);
    if (!await validateProjectionWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 512_000);
      sendJson(response, 200, createRuntimeProjectionValidationResponse(readProjectionSource(body)));
    } catch (error) {
      sendJson(response, errorStatus(error), { ok: false, error: safeProjectionError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/runtime-projection/project") {
    const access = authorizeRuntimeProjectionAdmin(session);
    if (!await validateProjectionWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 512_000);
      sendJson(response, 201, createRuntimeProjectionProjectResponse(readProjectionSource(body)));
    } catch (error) {
      sendJson(response, errorStatus(error), { ok: false, error: safeProjectionError(error) });
    }
    return true;
  }

  return false;
}

async function validateProjectionWriteAccess(
  request: IncomingMessage,
  response: ServerResponse,
  access: RuntimeProjectionAuthorizationResult
): Promise<boolean> {
  const policy = validateStateChangingRequest(request, { requireCsrf: true });

  if (!access.allowed || !policy.allowed) {
    sendJson(response, access.allowed ? 403 : accessStatus(access), {
      ok: false,
      error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access)
    });
    return false;
  }

  return true;
}

function readProjectionSource(body: unknown): RuntimeProjectionSource {
  const candidate = body as { readonly source?: unknown; readonly sourceId?: unknown } | null;
  if (candidate?.source && typeof candidate.source === "object") {
    return candidate.source as RuntimeProjectionSource;
  }

  if (typeof candidate?.sourceId === "string") {
    return createRuntimeProjectionSource({ sourceId: candidate.sourceId });
  }

  throw new Error("invalid_runtime_projection_source");
}

function sendAccessDenied(response: ServerResponse, result: RuntimeProjectionAuthorizationResult): void {
  sendJson(response, accessStatus(result), { ok: false, error: accessError(result) });
}

function accessStatus(result: RuntimeProjectionAuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: RuntimeProjectionAuthorizationResult): string {
  if (result.allowed) {
    return "ok";
  }

  return result.reason === "missing_session"
    ? "editor_session_required"
    : result.reason === "missing_role" ? "editor_admin_required" : "editor_scope_required";
}

function route(
  id: EditorRuntimeProjectionRouteId | RuntimeProjectionRouteId,
  method: RuntimeProjectionHttpMethod,
  path: string,
  stateChanging: boolean,
  readOnly: boolean
): RuntimeProjectionRouteDefinition {
  return {
    id,
    method,
    path,
    public: readOnly,
    requiredScope: readOnly ? null : "editor",
    requiredEditorRole: readOnly ? null : "editor_admin",
    stateChanging,
    requiresCsrf: stateChanging,
    readOnly,
    implementsRuntimeRenderer: false,
    modifiesAssets: false,
    containsConcreteGameContent: false,
    leaksEditorDraftData: false
  };
}

function errorStatus(error: unknown): number {
  return error instanceof Error && error.message.includes("validation") ? 422 : 400;
}

function safeProjectionError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "invalid_runtime_projection_source",
    "runtime_projection_validation_failed",
    "runtime_projection_manifest_invalid",
    "request_body_too_large",
    "request_body_required",
    "invalid_json"
  ]);
  return safeCodes.has(code) ? code : "runtime_projection_request_failed";
}
