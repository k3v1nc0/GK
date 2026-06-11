import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { authorizeEditorGameUserManagement } from "./editor-game-user-management.js";
import { authorizeRequest } from "./auth-routes.js";
import { saveGameBibleNodeFromRequest } from "./gamebible-node-routes.js";
import { sendJson, sendText } from "./http-utils.js";
import { readSmokeSession } from "./runtime-session.js";

export interface ApiRuntimeOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createApiHttpServer(): Server {
  return createServer((request, response) => {
    void handleApiRequest(request, response).catch(() => {
      sendJson(response, 500, { ok: false, error: "internal_error" });
    });
  });
}

export async function handleApiRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  const session = readSmokeSession(request);

  if (request.method === "GET" && url.pathname === "/health/editor") {
    sendJson(response, 200, { ok: true, service: "api-server", editorRuntime: "ready" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/editor/me") {
    const auth = authorizeRequest("editor.me", session);

    if (!auth.allowed) {
      sendJson(response, 401, { authenticated: false, scope: "editor" });
      return;
    }

    sendJson(response, 200, { authenticated: true, scope: "editor", roles: session?.editorRoles ?? [] });
    return;
  }

  if (request.method === "GET" && url.pathname === "/editor/game-users") {
    const access = authorizeEditorGameUserManagement(session);

    if (!access.allowed) {
      sendJson(response, 403, { ok: false, error: "editor_admin_required" });
      return;
    }

    sendJson(response, 200, { ok: true, users: [], source: "database_required" });
    return;
  }

  if (request.method === "PATCH" && /^\/editor\/game-users\/[^/]+\/status$/.test(url.pathname)) {
    const access = authorizeEditorGameUserManagement(session);

    if (!access.allowed) {
      sendJson(response, 403, { ok: false, error: "editor_admin_required" });
      return;
    }

    sendJson(response, 202, { ok: true, accepted: true, auditAction: "user.status.change" });
    return;
  }

  if (request.method === "POST" && url.pathname === "/editor/game-bible-node/save") {
    try {
      const result = await saveGameBibleNodeFromRequest(request, session);
      sendJson(response, 200, { ok: true, auditAction: result.auditAction });
    } catch (error) {
      const code = getSafeGameBibleNodeErrorCode(error);
      const status = code === "missing_editor_admin" ? 403 : code === "csrf_required" || code === "origin_not_allowed" ? 403 : 400;
      sendJson(response, status, { ok: false, error: code });
    }
    return;
  }

  sendText(response, 404, "Not found");
}

function getSafeGameBibleNodeErrorCode(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  const safeCodes = new Set([
    "missing_editor_admin",
    "origin_not_allowed",
    "csrf_required",
    "invalid_json",
    "request_body_too_large",
    "game_bible_json_object_required",
    "game_bible_json_contract_invalid",
    "game_bible_save_locked"
  ]);

  return safeCodes.has(code) ? code : "game_bible_save_failed";
}

export function startApiServer(options: ApiRuntimeOptions = {}): Server {
  const port = options.port ?? Number(process.env.GK_API_PORT ?? process.env.PORT ?? 3001);
  const host = options.host ?? process.env.GK_API_HOST ?? "127.0.0.1";
  const server = createApiHttpServer();

  server.listen(port, host, () => {
    console.log(`GK API server listening on http://${host}:${port}`);
  });

  return server;
}
