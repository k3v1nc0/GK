import type { IncomingMessage, ServerResponse } from "node:http";

import {
  scanAssetSourceDirectory,
  type AssetLibrarySnapshot
} from "@gk/asset-library";

import { authorizeRequest, type AuthorizationResult, type SessionContext } from "./auth-routes.js";
import { sendJson } from "./http-utils.js";
import { validateStateChangingRequest } from "./request-security.js";

export const EDITOR_ASSET_LIBRARY_ROUTE_IDS = {
  read: "editor.asset_library.read",
  scan: "editor.asset_library.scan"
} as const;

export interface EditorAssetLibraryAccess {
  readonly allowed: boolean;
  readonly result: AuthorizationResult;
  readonly requiresScope: "editor";
  readonly uploadsAssets: false;
  readonly createsAssets: false;
  readonly publishesRuntimeOutput: false;
}

export interface EditorAssetLibraryRouteOptions {
  readonly sourceDir?: string | undefined;
  readonly now?: Date | undefined;
}

export interface EditorAssetLibraryResponse {
  readonly ok: true;
  readonly library: AssetLibrarySnapshot;
  readonly counts: AssetLibrarySnapshot["counts"];
  readonly validationIssues: AssetLibrarySnapshot["validationIssues"];
  readonly uploadsAssets: false;
  readonly createsAssets: false;
  readonly publishesRuntimeOutput: false;
}

export function authorizeEditorAssetLibraryAccess(
  routeId: (typeof EDITOR_ASSET_LIBRARY_ROUTE_IDS)[keyof typeof EDITOR_ASSET_LIBRARY_ROUTE_IDS],
  session?: SessionContext | null
): EditorAssetLibraryAccess {
  const result = authorizeRequest(routeId, session);

  return {
    allowed: result.allowed,
    result,
    requiresScope: "editor",
    uploadsAssets: false,
    createsAssets: false,
    publishesRuntimeOutput: false
  };
}

export async function createEditorAssetLibraryReadResponse(
  options: EditorAssetLibraryRouteOptions = {}
): Promise<EditorAssetLibraryResponse> {
  const library = await scanAssetSourceDirectory({
    sourceDir: resolveAssetSourceDir(options.sourceDir),
    now: options.now
  });

  return responseFromSnapshot(library);
}

export async function createEditorAssetLibraryScanResponse(
  options: EditorAssetLibraryRouteOptions = {}
): Promise<EditorAssetLibraryResponse> {
  const library = await scanAssetSourceDirectory({
    sourceDir: resolveAssetSourceDir(options.sourceDir),
    now: options.now
  });

  return responseFromSnapshot(library);
}

export async function handleEditorAssetLibraryHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  session: SessionContext | null,
  options: EditorAssetLibraryRouteOptions = {}
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/editor/assets/library") {
    const access = authorizeEditorAssetLibraryAccess(EDITOR_ASSET_LIBRARY_ROUTE_IDS.read, session);

    if (!access.allowed) {
      sendJson(response, accessStatus(access.result), { ok: false, error: accessError(access.result) });
      return true;
    }

    sendJson(response, 200, await createEditorAssetLibraryReadResponse(options));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/editor/assets/scan") {
    const access = authorizeEditorAssetLibraryAccess(EDITOR_ASSET_LIBRARY_ROUTE_IDS.scan, session);
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!access.allowed || !policy.allowed) {
      sendJson(response, access.allowed ? 403 : accessStatus(access.result), {
        ok: false,
        error: access.allowed ? policy.issue ?? "request_not_allowed" : accessError(access.result)
      });
      return true;
    }

    sendJson(response, 200, await createEditorAssetLibraryScanResponse(options));
    return true;
  }

  return false;
}

function responseFromSnapshot(library: AssetLibrarySnapshot): EditorAssetLibraryResponse {
  return {
    ok: true,
    library,
    counts: library.counts,
    validationIssues: library.validationIssues,
    uploadsAssets: false,
    createsAssets: false,
    publishesRuntimeOutput: false
  };
}

function resolveAssetSourceDir(sourceDir?: string): string {
  return sourceDir ?? process.env.GK_ASSET_SOURCE_DIR ?? "/var/www/gk/assets";
}

function accessStatus(result: AuthorizationResult): number {
  return !result.allowed && result.reason === "missing_session" ? 401 : 403;
}

function accessError(result: AuthorizationResult): string {
  return !result.allowed && result.reason === "missing_session" ? "editor_session_required" : "editor_scope_required";
}
