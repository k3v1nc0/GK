export type AuthScope = "editor" | "game";
export type EditorRoleSlug = "editor_admin";
export type GameUserStatus = "pending_verification" | "active" | "suspended" | "banned" | "deleted";
export type HttpMethod = "GET" | "POST" | "PATCH";

export interface SessionContext {
  readonly scope: AuthScope;
  readonly editorUserId?: string;
  readonly editorSessionId?: string;
  readonly editorRoles?: readonly EditorRoleSlug[];
  readonly gameUserStatus?: GameUserStatus;
  readonly emailVerified?: boolean;
}

export interface AuthRouteDefinition {
  readonly id: string;
  readonly method: HttpMethod;
  readonly path: string;
  readonly public: boolean;
  readonly requiredScope: AuthScope | null;
  readonly requiredEditorRole?: EditorRoleSlug;
  readonly allowedGameStatuses?: readonly GameUserStatus[];
  readonly issuesSessionScope?: AuthScope;
  readonly rotatesSession: boolean;
  readonly revokesSession: boolean;
  readonly requiresRateLimit: boolean;
  readonly avoidsAccountEnumeration: boolean;
  readonly auditAction?: string;
}

export type AuthorizationResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "unknown_route" | "missing_session" | "wrong_scope" | "missing_role" | "invalid_game_status" };

export const AUTH_ROUTES = [
  {
    id: "editor.login",
    method: "POST",
    path: "/auth/editor/login",
    public: true,
    requiredScope: null,
    issuesSessionScope: "editor",
    rotatesSession: true,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "editor.login"
  },
  {
    id: "editor.logout",
    method: "POST",
    path: "/auth/editor/logout",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: true,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "editor.me",
    method: "GET",
    path: "/auth/editor/me",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "game.register",
    method: "POST",
    path: "/auth/game/register",
    public: true,
    requiredScope: null,
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true
  },
  {
    id: "game.login",
    method: "POST",
    path: "/auth/game/login",
    public: true,
    requiredScope: null,
    issuesSessionScope: "game",
    rotatesSession: true,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true
  },
  {
    id: "game.logout",
    method: "POST",
    path: "/auth/game/logout",
    public: false,
    requiredScope: "game",
    rotatesSession: false,
    revokesSession: true,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "game.me",
    method: "GET",
    path: "/auth/game/me",
    public: false,
    requiredScope: "game",
    allowedGameStatuses: ["pending_verification", "active"],
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "email_verification.request",
    method: "POST",
    path: "/auth/email-verification/request",
    public: true,
    requiredScope: null,
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true
  },
  {
    id: "email_verification.confirm",
    method: "POST",
    path: "/auth/email-verification/confirm",
    public: true,
    requiredScope: null,
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true
  },
  {
    id: "password_reset.request",
    method: "POST",
    path: "/auth/password-reset/request",
    public: true,
    requiredScope: null,
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "password_reset.request"
  },
  {
    id: "password_reset.confirm",
    method: "POST",
    path: "/auth/password-reset/confirm",
    public: true,
    requiredScope: null,
    rotatesSession: false,
    revokesSession: true,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "password_reset.complete"
  },
  {
    id: "editor.game_users.list",
    method: "GET",
    path: "/editor/game-users",
    public: false,
    requiredScope: "editor",
    requiredEditorRole: "editor_admin",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true,
    auditAction: "game_user.admin_action"
  },
  {
    id: "editor.game_users.status_update",
    method: "PATCH",
    path: "/editor/game-users/:gameUserId/status",
    public: false,
    requiredScope: "editor",
    requiredEditorRole: "editor_admin",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "user.status.change"
  },
  {
    id: "editor.game_bible_node.save",
    method: "POST",
    path: "/editor/game-bible-node/save",
    public: false,
    requiredScope: "editor",
    requiredEditorRole: "editor_admin",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "game_bible_node.save"
  },
  {
    id: "editor.asset_library.read",
    method: "GET",
    path: "/editor/assets/library",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "editor.asset_library.scan",
    method: "POST",
    path: "/editor/assets/scan",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "editor.asset_library.scan"
  },
  {
    id: "editor.graph.draft",
    method: "GET",
    path: "/editor/graph/draft",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: false,
    avoidsAccountEnumeration: true
  },
  {
    id: "editor.graph.operation",
    method: "POST",
    path: "/editor/graph/operation",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "editor.graph.operation"
  },
  {
    id: "editor.graph.preview",
    method: "POST",
    path: "/editor/graph/preview",
    public: false,
    requiredScope: "editor",
    rotatesSession: false,
    revokesSession: false,
    requiresRateLimit: true,
    avoidsAccountEnumeration: true,
    auditAction: "editor.graph.preview"
  }
] as const satisfies readonly AuthRouteDefinition[];

export function getAuthRoute(routeId: string): AuthRouteDefinition | undefined {
  return AUTH_ROUTES.find((route) => route.id === routeId);
}

export function authorizeRequest(routeId: string, session?: SessionContext | null): AuthorizationResult {
  const route = getAuthRoute(routeId);

  if (!route) {
    return { allowed: false, reason: "unknown_route" };
  }

  if (!route.requiredScope) {
    return { allowed: true };
  }

  if (!session) {
    return { allowed: false, reason: "missing_session" };
  }

  if (session.scope !== route.requiredScope) {
    return { allowed: false, reason: "wrong_scope" };
  }

  if (route.requiredEditorRole && !session.editorRoles?.includes(route.requiredEditorRole)) {
    return { allowed: false, reason: "missing_role" };
  }

  if (route.allowedGameStatuses && (!session.gameUserStatus || !route.allowedGameStatuses.includes(session.gameUserStatus))) {
    return { allowed: false, reason: "invalid_game_status" };
  }

  return { allowed: true };
}
