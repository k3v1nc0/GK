import { authorizeRequest, type AuthorizationResult, type SessionContext } from "./auth-routes.js";

export const EDITOR_GAME_USER_MANAGEMENT_ROUTES = {
  list: "editor.game_users.list",
  statusUpdate: "editor.game_users.status_update"
} as const;

export interface EditorGameUserManagementAccess {
  readonly list: AuthorizationResult;
  readonly statusUpdate: AuthorizationResult;
  readonly allowed: boolean;
  readonly requiresScope: "editor";
  readonly requiresRole: "editor_admin";
}

export function authorizeEditorGameUserManagement(
  session?: SessionContext | null
): EditorGameUserManagementAccess {
  const list = authorizeRequest(EDITOR_GAME_USER_MANAGEMENT_ROUTES.list, session);
  const statusUpdate = authorizeRequest(EDITOR_GAME_USER_MANAGEMENT_ROUTES.statusUpdate, session);

  return {
    list,
    statusUpdate,
    allowed: list.allowed && statusUpdate.allowed,
    requiresScope: "editor",
    requiresRole: "editor_admin"
  };
}
