import type { IncomingMessage } from "node:http";

import { authorizeRequest, type SessionContext } from "./auth-routes.js";
import { readJsonBody } from "./http-utils.js";
import { writeGameBibleNodeJsonAtomically, type GameBibleNodeWriteResult } from "./gamebible-node-store.js";
import { validateStateChangingRequest } from "./request-security.js";

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

  const requestPolicy = validateStateChangingRequest(request, { requireCsrf: true });
  if (!requestPolicy.allowed) {
    return {
      allowed: false,
      reason: requestPolicy.issue ?? "origin_not_allowed"
    };
  }

  return { allowed: true };
}
