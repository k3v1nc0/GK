import type { IncomingMessage, ServerResponse } from "node:http";

import {
  validateMinimapMarkerDraft,
  validatePhase9WorldInput,
  validateUiAssetDisplayContract,
  type MinimapLayerDraft,
  type MinimapMarkerDraft,
  type MinimapViewDraft,
  type Phase9ValidationIssue,
  type Phase9WorldValidationInput,
  type UiAssetDisplayContract,
  type WorldSettingsDraft
} from "@gk/schemas";

import type { SessionContext } from "./auth-routes.js";
import { readJsonBody, sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_WORLD_ROUTE_IDS = {
  worldSettings: "editor.world.settings",
  worldValidate: "editor.world.validate",
  minimapSettings: "editor.minimap.settings",
  minimapValidate: "editor.minimap.validate",
  uiDisplayAssets: "editor.ui_display.assets",
  uiDisplayValidate: "editor.ui_display.validate"
} as const;

export type EditorWorldRouteId = (typeof EDITOR_WORLD_ROUTE_IDS)[keyof typeof EDITOR_WORLD_ROUTE_IDS];

export type EditorWorldHttpMethod = "GET" | "POST";

export interface EditorWorldRouteDefinition {
  readonly id: EditorWorldRouteId;
  readonly method: EditorWorldHttpMethod;
  readonly path: string;
  readonly public: false;
  readonly requiredScope: "editor";
  readonly stateChanging: boolean;
  readonly requiresCsrf: boolean;
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export type EditorWorldAuthorizationResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "missing_session" | "wrong_scope" };

export const EDITOR_WORLD_ROUTE_DEFINITIONS: readonly EditorWorldRouteDefinition[] = [
  route(EDITOR_WORLD_ROUTE_IDS.worldSettings, "GET", "/editor/world/settings", false),
  route(EDITOR_WORLD_ROUTE_IDS.worldValidate, "POST", "/editor/world/validate", true),
  route(EDITOR_WORLD_ROUTE_IDS.minimapSettings, "GET", "/editor/minimap/settings", false),
  route(EDITOR_WORLD_ROUTE_IDS.minimapValidate, "POST", "/editor/minimap/validate", true),
  route(EDITOR_WORLD_ROUTE_IDS.uiDisplayAssets, "GET", "/editor/ui-display/assets", false),
  route(EDITOR_WORLD_ROUTE_IDS.uiDisplayValidate, "POST", "/editor/ui-display/validate", true)
] as const;

export interface EditorWorldAccess {
  readonly allowed: boolean;
  readonly result: EditorWorldAuthorizationResult;
  readonly requiresScope: "editor";
  readonly publishesRuntimeOutput: false;
  readonly modifiesAssets: false;
}

export interface EditorWorldSettingsResponse {
  readonly ok: true;
  readonly worldSettings: WorldSettingsDraft | null;
  readonly requiresNodeData: true;
  readonly generatedCandidatesRemainDraft: true;
  readonly publishesRuntimeOutput: false;
}

export interface EditorWorldValidationResponse {
  readonly ok: true;
  readonly issues: readonly Phase9ValidationIssue[];
  readonly validForDraftPreview: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface EditorMinimapSettingsResponse {
  readonly ok: true;
  readonly editorView: MinimapViewDraft | null;
  readonly gameView: MinimapViewDraft | null;
  readonly layers: readonly MinimapLayerDraft[];
  readonly markers: readonly MinimapMarkerDraft[];
  readonly editorAndGameViewsMayDiffer: true;
  readonly markerDisplayUsesNodeData: true;
  readonly publishesRuntimeOutput: false;
}

export interface EditorMinimapValidationResponse {
  readonly ok: true;
  readonly issues: readonly Phase9ValidationIssue[];
  readonly validForDraftPreview: boolean;
  readonly publishesRuntimeOutput: false;
}

export interface EditorUiDisplayAssetsResponse {
  readonly ok: true;
  readonly assetsSource: "asset-library";
  readonly includesNaturalSizeMetadataWhenAvailable: true;
  readonly displaySizeMustComeFromNodeData: true;
  readonly modifiesAssets: false;
  readonly publishesRuntimeOutput: false;
}

export interface EditorUiDisplayValidationResponse {
  readonly ok: true;
  readonly issues: readonly Phase9ValidationIssue[];
  readonly validForDraftPreview: boolean;
  readonly publishesRuntimeOutput: false;
}

export function authorizeEditorWorldAccess(
  routeId: EditorWorldRouteId,
  session?: SessionContext | null
): EditorWorldAccess {
  const result = authorizeEditorWorldSession(session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

export function authorizeEditorWorldSession(session?: SessionContext | null): EditorWorldAuthorizationResult {
  if (!session) {
    return { allowed: false, reason: "missing_session" };
  }

  if (session.scope !== "editor") {
    return { allowed: false, reason: "wrong_scope" };
  }

  return { allowed: true };
}

export function createEditorWorldSettingsResponse(): EditorWorldSettingsResponse {
  return {
    ok: true,
    worldSettings: null,
    requiresNodeData: true,
    generatedCandidatesRemainDraft: true,
    publishesRuntimeOutput: false
  };
}

export function createEditorWorldValidationResponse(input: Phase9WorldValidationInput): EditorWorldValidationResponse {
  const issues = validatePhase9WorldInput(input);

  return {
    ok: true,
    issues,
    validForDraftPreview: !issues.some((candidate) => candidate.severity === "error"),
    publishesRuntimeOutput: false
  };
}

export function createEditorMinimapSettingsResponse(): EditorMinimapSettingsResponse {
  return {
    ok: true,
    editorView: null,
    gameView: null,
    layers: [],
    markers: [],
    editorAndGameViewsMayDiffer: true,
    markerDisplayUsesNodeData: true,
    publishesRuntimeOutput: false
  };
}

export function createEditorMinimapValidationResponse(markers: readonly MinimapMarkerDraft[]): EditorMinimapValidationResponse {
  const issues = markers.flatMap((marker, index) =>
    validateMinimapMarkerDraft(marker).map((issue) => ({
      ...issue,
      path: `markers.${index}.${issue.path}`
    }))
  );

  return {
    ok: true,
    issues,
    validForDraftPreview: !issues.some((candidate) => candidate.severity === "error"),
    publishesRuntimeOutput: false
  };
}

export function createEditorUiDisplayAssetsResponse(): EditorUiDisplayAssetsResponse {
  return {
    ok: true,
    assetsSource: "asset-library",
    includesNaturalSizeMetadataWhenAvailable: true,
    displaySizeMustComeFromNodeData: true,
    modifiesAssets: false,
    publishesRuntimeOutput: false
  };
}

export function createEditorUiDisplayValidationResponse(displays: readonly UiAssetDisplayContract[]): EditorUiDisplayValidationResponse {
  const issues = displays.flatMap((display, index) =>
    validateUiAssetDisplayContract(display).map((issue) => ({
      ...issue,
      path: `displays.${index}.${issue.path}`
    }))
  );

  return {
    ok: true,
    issues,
    validForDraftPreview: !issues.some((candidate) => candidate.severity === "error"),
    publishesRuntimeOutput: false
  };
}

export async function handleEditorWorldHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/world/settings") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.worldSettings, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorWorldSettingsResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/minimap/settings") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.minimapSettings, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorMinimapSettingsResponse());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/editor/ui-display/assets") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.uiDisplayAssets, session);
    if (!access.allowed) {
      sendAccessDenied(response, access.result);
      return true;
    }

    sendJson(response, 200, createEditorUiDisplayAssetsResponse());
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/world/validate") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.worldValidate, session);
    if (!await validateWorldWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorWorldValidationResponse(readWorldValidationInput(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeWorldError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/minimap/validate") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.minimapValidate, session);
    if (!await validateWorldWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorMinimapValidationResponse(readMinimapMarkers(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeWorldError(error) });
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/ui-display/validate") {
    const access = authorizeEditorWorldAccess(EDITOR_WORLD_ROUTE_IDS.uiDisplayValidate, session);
    if (!await validateWorldWriteAccess(request, response, access)) {
      return true;
    }

    try {
      const body = await readJsonBody(request, 256_000);
      sendJson(response, 200, createEditorUiDisplayValidationResponse(readUiDisplays(body)));
    } catch (error) {
      sendJson(response, 400, { ok: false, error: safeWorldError(error) });
    }
    return true;
  }

  return false;
}

async function validateWorldWriteAccess(
  request: IncomingMessage,
  response: ServerResponse,
  access: EditorWorldAccess
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

function readWorldValidationInput(body: unknown): Phase9WorldValidationInput {
  const candidate = body as { readonly world?: unknown } | null;
  if (!candidate?.world || typeof candidate.world !== "object") {
    throw new Error("invalid_world_validation_input");
  }

  return candidate.world as Phase9WorldValidationInput;
}

function readMinimapMarkers(body: unknown): readonly MinimapMarkerDraft[] {
  const candidate = body as { readonly markers?: unknown } | null;
  if (!Array.isArray(candidate?.markers)) {
    throw new Error("invalid_minimap_validation_input");
  }

  return candidate.markers as readonly MinimapMarkerDraft[];
}

function readUiDisplays(body: unknown): readonly UiAssetDisplayContract[] {
  const candidate = body as { readonly displays?: unknown } | null;
  if (!Array.isArray(candidate?.displays)) {
    throw new Error("invalid_ui_display_validation_input");
  }

  return candidate.displays as readonly UiAssetDisplayContract[];
}

function sendAccessDenied(response: ServerResponse, result: EditorWorldAuthorizationResult): void {
  sendJson(response, accessStatus(result), { ok: false, error: accessError(result) });
}

function accessStatus(result: EditorWorldAuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: EditorWorldAuthorizationResult): string {
  return !result.allowed && result.reason === "missing_session" ? "editor_session_required" : "editor_scope_required";
}

function route(
  id: EditorWorldRouteId,
  method: EditorWorldHttpMethod,
  path: string,
  stateChanging: boolean
): EditorWorldRouteDefinition {
  return {
    id,
    method,
    path,
    public: false,
    requiredScope: "editor",
    stateChanging,
    requiresCsrf: stateChanging,
    publishesRuntimeOutput: false,
    modifiesAssets: false
  };
}

function safeWorldError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "invalid_world_validation_input",
    "invalid_minimap_validation_input",
    "invalid_ui_display_validation_input",
    "request_body_too_large",
    "invalid_json"
  ]);
  return safeCodes.has(code) ? code : "editor_world_request_failed";
}
