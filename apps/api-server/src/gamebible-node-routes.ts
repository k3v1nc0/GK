import type { IncomingMessage } from "node:http";

import { authorizeRequest, type SessionContext } from "./auth-routes.js";
import { getSingleHeader, readJsonBody } from "./http-utils.js";
import { writeGameBibleNodeJsonAtomically, type GameBibleNodeWriteResult } from "./gamebible-node-store.js";

export interface GameBibleNodeSavePolicyResult {
  readonly allowed: boolean;
  readonly reason?: "missing_editor_admin" | "csrf_required" | "origin_not_allowed";
}

export async function saveGameBibleNodeFromRequest(
  request: IncomingMessage,
  session: SessionContext | null
): Promise<GameBibleNodeWriteResult> {
  const policy = validateGameBibleNodeSavePolicy(request, session);

  if (!policy.allowed) {
    throw new Error(policy.reason);
  }

  const document = await readJsonBody(request);
  return writeGameBibleNodeJsonAtomically(document);
}

export function validateGameBibleNodeSavePolicy(
  request: IncomingMessage,
  session: SessionContext | null
): GameBibleNodeSavePolicyResult {
  const auth = authorizeRequest("editor.game_bible_node.save", session);

  if (!auth.allowed) {
    return {
      allowed: false,
      reason: "missing_editor_admin"
    };
  }

  if (!isOriginAllowed(request)) {
    return {
      allowed: false,
      reason: "origin_not_allowed"
    };
  }

  if (process.env.GK_REQUIRE_CSRF !== "0" && !hasCsrfProof(request)) {
    return {
      allowed: false,
      reason: "csrf_required"
    };
  }

  return { allowed: true };
}

function isOriginAllowed(request: IncomingMessage): boolean {
  const origin = getSingleHeader(request, "origin");
  const allowed = (process.env.GK_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!origin) {
    return process.env.GK_ALLOW_MISSING_ORIGIN_FOR_SMOKE === "1";
  }

  return allowed.includes(origin);
}

function hasCsrfProof(request: IncomingMessage): boolean {
  const headerToken = getSingleHeader(request, "x-gk-csrf-token");

  if (!headerToken) {
    return false;
  }

  const cookieToken = (getSingleHeader(request, "cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("gk_csrf="))
    ?.slice("gk_csrf=".length);

  return Boolean(cookieToken && cookieToken === headerToken);
}
