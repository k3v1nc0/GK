export const gameAuthClientContract = {
  scope: "game",
  publicRegistration: true,
  requiresEmailVerificationForFullAccess: true,
  routes: {
    register: "/auth/game/register",
    login: "/auth/game/login",
    logout: "/auth/game/logout",
    me: "/auth/game/me",
    emailVerificationRequest: "/auth/email-verification/request",
    emailVerificationConfirm: "/auth/email-verification/confirm",
    passwordResetRequest: "/auth/password-reset/request",
    passwordResetConfirm: "/auth/password-reset/confirm"
  },
  rejectsEditorSession: true
} as const;

export type GameAuthClientRoute = keyof typeof gameAuthClientContract.routes;