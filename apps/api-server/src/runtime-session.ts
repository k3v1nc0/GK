import type { IncomingMessage } from "node:http";

import type { SessionContext } from "./auth-routes.js";
import type { EditorAuthStore } from "./editor-auth-store.js";
import { getSingleHeader } from "./http-utils.js";
import {
  EDITOR_SESSION_COOKIE,
  hashSessionToken,
  readCookie
} from "./session-cookies.js";

export async function readRequestSession(
  request: IncomingMessage,
  store: EditorAuthStore | null,
  now = new Date()
): Promise<SessionContext | null> {
  const smokeSession = readSmokeSession(request);

  if (smokeSession) {
    return smokeSession;
  }

  if (!store) {
    return null;
  }

  const editorSessionToken = readCookie(request, EDITOR_SESSION_COOKIE);

  if (!editorSessionToken) {
    return null;
  }

  const session = await store.findEditorSessionByTokenHash(hashSessionToken(editorSessionToken), now);

  if (!session) {
    return null;
  }

  return {
    scope: "editor",
    editorUserId: session.editorUserId,
    editorSessionId: session.id,
    editorRoles: session.roles
  };
}

export function readSmokeSession(request: IncomingMessage): SessionContext | null {
  if (process.env.GK_ENABLE_SMOKE_AUTH_HEADERS !== "1") {
    return null;
  }

  const scope = getSingleHeader(request, "x-gk-smoke-scope");

  if (scope === "editor") {
    const roles = (getSingleHeader(request, "x-gk-smoke-editor-roles") ?? "")
      .split(",")
      .map((role) => role.trim())
      .filter((role): role is "editor_admin" => role === "editor_admin");

    return {
      scope: "editor",
      editorRoles: roles
    };
  }

  if (scope === "game") {
    return {
      scope: "game",
      gameUserStatus: "active",
      emailVerified: true
    };
  }

  return null;
}
