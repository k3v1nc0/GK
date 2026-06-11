import type { IncomingMessage } from "node:http";

import type { SessionContext } from "./auth-routes.js";
import { getSingleHeader } from "./http-utils.js";

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
