export const editorAuthClientContract = {
  scope: "editor",
  publicRegistration: false,
  requiredRoleForGameUserManagement: "editor_admin",
  routes: {
    login: "/auth/editor/login",
    logout: "/auth/editor/logout",
    me: "/auth/editor/me",
    gameUserList: "/editor/game-users",
    gameUserStatusUpdate: "/editor/game-users/:gameUserId/status"
  },
  rejectsGameSession: true
} as const;

export type EditorAuthClientRoute = keyof typeof editorAuthClientContract.routes;