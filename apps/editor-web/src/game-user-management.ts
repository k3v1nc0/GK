export interface EditorSessionSummary {
  readonly scope: "editor" | "game";
  readonly editorRoles?: readonly string[];
}

export interface GameUserManagementPanelContract {
  readonly panelId: "game-users";
  readonly requiresScope: "editor";
  readonly requiresRole: "editor_admin";
  readonly routes: {
    readonly list: "/editor/game-users";
    readonly statusUpdate: "/editor/game-users/:gameUserId/status";
  };
  readonly avoidsAccountEnumeration: true;
}

export const gameUserManagementPanelContract: GameUserManagementPanelContract = {
  panelId: "game-users",
  requiresScope: "editor",
  requiresRole: "editor_admin",
  routes: {
    list: "/editor/game-users",
    statusUpdate: "/editor/game-users/:gameUserId/status"
  },
  avoidsAccountEnumeration: true
} as const;

export function canOpenGameUserManagementPanel(session: EditorSessionSummary | null | undefined): boolean {
  return session?.scope === "editor" && session.editorRoles?.includes("editor_admin") === true;
}
