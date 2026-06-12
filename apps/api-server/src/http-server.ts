import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { authorizeEditorGameUserManagement } from "./editor-game-user-management.js";
import {
  handleEditorAssetLibraryHttpRequest
} from "./editor-asset-library-routes.js";
import {
  handleEditorEntityHttpRequest
} from "./editor-entity-routes.js";
import {
  handleEditorGraphHttpRequest
} from "./editor-graph-routes.js";
import {
  handleEditorProceduralHttpRequest
} from "./editor-procedural-routes.js";
import { authorizeRequest, type SessionContext } from "./auth-routes.js";
import type { EditorAuthStore } from "./editor-auth-store.js";
import { saveGameBibleNodeFromRequest } from "./gamebible-node-routes.js";
import { GAME_BIBLE_NODE_SAVE_CLIENT_ROUTE, renderGameBibleNodeSaveClient } from "./gamebible-node-save-client.js";
import { getSingleHeader, readJsonBody, sendJson, sendText } from "./http-utils.js";
import { getDefaultEditorAuthStore } from "./mysql-editor-auth-store.js";
import { verifyEditorPassword, type EditorPasswordVerifier } from "./password-verifier.js";
import { validateStateChangingRequest } from "./request-security.js";
import { readRequestSession } from "./runtime-session.js";
import {
  createEditorLogoutCookies,
  createEditorSessionCookies,
  createOpaqueToken,
  EDITOR_SESSION_COOKIE,
  hashRequestValue,
  hashSessionToken,
  readCookie
} from "./session-cookies.js";
import { normalizeEmailForAuth } from "./auth-policy.js";

export interface ApiRuntimeOptions {
  readonly port?: number;
  readonly host?: string;
}

export interface ApiRuntimeDependencies {
  readonly editorAuthStore?: EditorAuthStore | null;
  readonly passwordVerifier?: EditorPasswordVerifier;
  readonly now?: () => Date;
  readonly assetSourceDir?: string;
}

export function createApiHttpServer(dependencies: ApiRuntimeDependencies = {}): Server {
  return createServer((request, response) => {
    void handleApiRequest(request, response, dependencies).catch(() => {
      sendJson(response, 500, { ok: false, error: "internal_error" });
    });
  });
}

export async function handleApiRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiRuntimeDependencies = {}
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health/editor") {
    sendJson(response, 200, { ok: true, service: "api-server", editorRuntime: "ready" });
    return;
  }

  if (request.method === "GET" && url.pathname === GAME_BIBLE_NODE_SAVE_CLIENT_ROUTE) {
    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    response.end(renderGameBibleNodeSaveClient());
    return;
  }

  const store = resolveEditorAuthStore(dependencies);
  const now = dependencies.now?.() ?? new Date();
  const session = await readRequestSession(request, store, now);

  if (request.method === "POST" && url.pathname === "/auth/editor/login") {
    await handleEditorLogin(request, response, store, dependencies, now);
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/editor/logout") {
    await handleEditorLogout(request, response, store, now);
    return;
  }

  if (request.method === "GET" && url.pathname === "/auth/editor/me") {
    const auth = authorizeRequest("editor.me", session);

    if (!auth.allowed) {
      sendJson(response, 401, { authenticated: false, scope: "editor" });
      return;
    }

    sendJson(response, 200, {
      authenticated: true,
      scope: "editor",
      editorUserId: session?.editorUserId ?? null,
      roles: session?.editorRoles ?? []
    });
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

  if (await handleEditorAssetLibraryHttpRequest(request, response, session, {
    sourceDir: dependencies.assetSourceDir,
    now
  })) {
    return;
  }

  if (await handleEditorEntityHttpRequest(request, response, session)) {
    return;
  }

  if (await handleEditorProceduralHttpRequest(request, response, session)) {
    return;
  }

  if (await handleEditorGraphHttpRequest(request, response, session)) {
    return;
  }

  sendText(response, 404, "Not found");
}

async function handleEditorLogin(
  request: IncomingMessage,
  response: ServerResponse,
  store: EditorAuthStore | null,
  dependencies: ApiRuntimeDependencies,
  now: Date
): Promise<void> {
  const requestPolicy = validateStateChangingRequest(request, { requireCsrf: false });

  if (!requestPolicy.allowed) {
    sendJson(response, 403, { ok: false, error: "request_not_allowed" });
    return;
  }

  if (!store) {
    sendJson(response, 503, { ok: false, error: "auth_store_unavailable" });
    return;
  }

  let body: unknown;

  try {
    body = await readJsonBody(request, 16_384);
  } catch {
    sendJson(response, 400, { ok: false, error: "invalid_request" });
    return;
  }

  const credentials = parseEditorLoginBody(body);
  const ipHash = hashRequestValue(getClientIp(request));
  const passwordVerifier = dependencies.passwordVerifier ?? verifyEditorPassword;

  if (!credentials) {
    await recordLoginFailure(store, null, ipHash, "invalid_request");
    sendJson(response, 401, { ok: false, error: "invalid_credentials" });
    return;
  }

  const user = await store.findEditorUserByNormalizedEmail(credentials.normalizedEmail);
  const canAttemptPassword = Boolean(user?.isActive && user.isEmailVerified);
  const passwordOk = user && canAttemptPassword
    ? await passwordVerifier(credentials.password, user.passwordHash, user.passwordHashAlgorithm)
    : false;

  if (!user || !canAttemptPassword || !passwordOk || !user.roles.includes("editor_admin")) {
    await recordLoginFailure(store, credentials.normalizedEmail, ipHash, "invalid_credentials");
    sendJson(response, 401, { ok: false, error: "invalid_credentials" });
    return;
  }

  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const maxAgeSeconds = Number(process.env.GK_EDITOR_SESSION_MAX_AGE_SECONDS ?? 8 * 60 * 60);
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000);

  await store.createEditorSession({
    editorUserId: user.id,
    sessionTokenHash: hashSessionToken(sessionToken),
    userAgentHash: hashRequestValue(getSingleHeader(request, "user-agent")),
    ipHash,
    expiresAt
  });
  await store.markEditorLoginSuccess(user.id, now);
  await store.recordAuditEvent({
    actorScope: "editor",
    actorEditorUserId: user.id,
    action: "editor.login",
    targetScope: "session",
    ipHash,
    metadata: { sessionScope: "editor" }
  });

  sendJson(
    response,
    200,
    {
      ok: true,
      authenticated: true,
      scope: "editor",
      roles: user.roles
    },
    {
      "set-cookie": createEditorSessionCookies(request, sessionToken, csrfToken, maxAgeSeconds) as string[]
    }
  );
}

async function handleEditorLogout(
  request: IncomingMessage,
  response: ServerResponse,
  store: EditorAuthStore | null,
  now: Date
): Promise<void> {
  const sessionToken = readCookie(request, EDITOR_SESSION_COOKIE);

  if (sessionToken) {
    const policy = validateStateChangingRequest(request, { requireCsrf: true });

    if (!policy.allowed) {
      sendJson(response, 403, { ok: false, error: policy.issue ?? "request_not_allowed" });
      return;
    }

    await store?.revokeEditorSessionByTokenHash(hashSessionToken(sessionToken), now);
  }

  sendJson(response, 200, { ok: true, authenticated: false }, {
    "set-cookie": createEditorLogoutCookies(request) as string[]
  });
}

function resolveEditorAuthStore(dependencies: ApiRuntimeDependencies): EditorAuthStore | null {
  if ("editorAuthStore" in dependencies) {
    return dependencies.editorAuthStore ?? null;
  }

  return getDefaultEditorAuthStore();
}

function parseEditorLoginBody(body: unknown): { normalizedEmail: string; password: string } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  const candidate = body as Record<string, unknown>;

  if (typeof candidate.email !== "string" || typeof candidate.password !== "string") {
    return null;
  }

  return {
    normalizedEmail: normalizeEmailForAuth(candidate.email),
    password: candidate.password
  };
}

async function recordLoginFailure(
  store: EditorAuthStore,
  normalizedEmail: string | null,
  ipHash: string | null,
  reason: string
): Promise<void> {
  await store.recordAuditEvent({
    actorScope: "system",
    action: "editor.login.failed",
    targetScope: "editor",
    ipHash,
    metadata: {
      reason,
      normalizedEmailHash: hashRequestValue(normalizedEmail)
    }
  });
}

function getClientIp(request: IncomingMessage): string | null {
  const forwardedFor = getSingleHeader(request, "x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  return request.socket.remoteAddress ?? null;
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
