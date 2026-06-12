import type { IncomingMessage, ServerResponse } from "node:http";

import {
  createAssetToEntityRoleMappingDraft,
  createEntityTemplateDraft,
  validateEntityTemplateDraft,
  type AssetToEntityRoleMappingDraft,
  type EntityAssetLibraryRecordGate,
  type EntityGroupDraft,
  type EntityTemplateDraft,
  type EntityValidationOptions
} from "@gk/schemas";

import { authorizeRequest, type AuthorizationResult, type SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_ENTITY_ROUTE_IDS = {
  draft: "editor.entity.draft",
  validate: "editor.entity.validate",
  groups: "editor.entity.groups",
  mappingRead: "editor.entity.asset_mappings.read",
  mappingUpdate: "editor.entity.asset_mappings.update"
} as const;

export interface EditorEntityAccess {
  readonly allowed: boolean;
  readonly result: AuthorizationResult;
  readonly requiresScope: "editor";
  readonly publishesRuntimeOutput: false;
}

export interface EditorEntityDraftResponse {
  readonly ok: true;
  readonly draft: EntityTemplateDraft;
  readonly groups: readonly EntityGroupDraft[];
  readonly publishesRuntimeOutput: false;
}

export interface EditorEntityValidationResponse {
  readonly ok: true;
  readonly issues: ReturnType<typeof validateEntityTemplateDraft>;
  readonly validForCandidate: boolean;
  readonly validForRuntimeActivation: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface EditorAssetEntityMappingResponse {
  readonly ok: true;
  readonly mappings: readonly AssetToEntityRoleMappingDraft[];
  readonly source: "asset-library";
  readonly roleMappingIsEditorData: true;
  readonly publishesRuntimeOutput: false;
}

export function authorizeEditorEntityAccess(
  routeId: (typeof EDITOR_ENTITY_ROUTE_IDS)[keyof typeof EDITOR_ENTITY_ROUTE_IDS],
  session?: SessionContext | null
): EditorEntityAccess {
  const result = authorizeRequest(routeId, session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    publishesRuntimeOutput: false
  };
}

export function createEditorEntityDraftResponse(): EditorEntityDraftResponse {
  return {
    ok: true,
    draft: createEntityTemplateDraft({ entityId: "editor-entity-draft" }),
    groups: [],
    publishesRuntimeOutput: false
  };
}

export function createEditorEntityValidationResponse(
  draft: EntityTemplateDraft,
  options: EntityValidationOptions = {}
): EditorEntityValidationResponse {
  const issues = validateEntityTemplateDraft(draft, options);

  return {
    ok: true,
    issues,
    validForCandidate: !issues.some((candidate) => candidate.severity === "error"),
    validForRuntimeActivation: !issues.some((candidate) => candidate.blocksRuntimeActivation),
    publishesRuntimeOutput: false
  };
}

export function createEditorAssetEntityMappingResponse(
  records: readonly EntityAssetLibraryRecordGate[] = []
): EditorAssetEntityMappingResponse {
  return {
    ok: true,
    mappings: records
      .filter((record) => record.assetType === "glb" && record.status === "active")
      .map((record) => createAssetToEntityRoleMappingDraft({ source: "asset-library", assetId: record.assetId })),
    source: "asset-library",
    roleMappingIsEditorData: true,
    publishesRuntimeOutput: false
  };
}

export async function handleEditorEntityHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/entities/draft") {
    const access = authorizeEditorEntityAccess(EDITOR_ENTITY_ROUTE_IDS.draft, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorEntityDraftResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/entities/groups") {
    const access = authorizeEditorEntityAccess(EDITOR_ENTITY_ROUTE_IDS.groups, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, { ok: true, groups: [], groupTransformDrafts: [], publishesRuntimeOutput: false });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/entities/asset-mappings") {
    const access = authorizeEditorEntityAccess(EDITOR_ENTITY_ROUTE_IDS.mappingRead, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorAssetEntityMappingResponse());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/entities/validate") {
    const access = authorizeEditorEntityAccess(EDITOR_ENTITY_ROUTE_IDS.validate, session);
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!access.allowed || !policy.allowed) {
      sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
        ok: false,
        error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
      });
      return true;
    }

    try {
      const body = await readJsonBody(request, 128_000);
      sendJson(response, 200, createEditorEntityValidationResponse(readEntityDraft(body), readValidationOptions(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeEntityError(error) });
    }
    return true;
  }

  if (request.method === "PATCH" && /^\/editor\/entities\/asset-mappings\/[^/]+$/.test(url.pathname)) {
    const access = authorizeEditorEntityAccess(EDITOR_ENTITY_ROUTE_IDS.mappingUpdate, session);
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!access.allowed || !policy.allowed) {
      sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
        ok: false,
        error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
      });
      return true;
    }

    const assetId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    sendJson(response, 202, {
      ok: true,
      mapping: createAssetToEntityRoleMappingDraft({ source: "asset-library", assetId }),
      acceptedAsEditorData: true,
      publishesRuntimeOutput: false
    });
    return true;
  }

  return false;
}

function readEntityDraft(body: unknown): EntityTemplateDraft {
  const candidate = body as { readonly draft?: unknown } | null;
  if (!candidate?.draft || typeof candidate.draft !== "object") {
    throw new Error("invalid_entity_draft");
  }

  return candidate.draft as EntityTemplateDraft;
}

function readValidationOptions(body: unknown): EntityValidationOptions {
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
    ...(Array.isArray(assetRecords) ? { assetRecords: assetRecords as readonly EntityAssetLibraryRecordGate[] } : {})
  };
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

function safeEntityError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set(["invalid_entity_draft", "request_body_too_large", "invalid_json"]);
  return safeCodes.has(code) ? code : "editor_entity_request_failed";
}
