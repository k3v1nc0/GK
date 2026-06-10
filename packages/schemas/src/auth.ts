export const AUTH_SCOPES = ["editor", "game"] as const;

export type AuthScope = (typeof AUTH_SCOPES)[number];

export const GAME_USER_STATUSES = [
  "pending_verification",
  "active",
  "suspended",
  "banned",
  "deleted"
] as const;

export type GameUserStatus = (typeof GAME_USER_STATUSES)[number];

export const EDITOR_ROLE_SLUGS = ["editor_admin"] as const;

export type EditorRoleSlug = (typeof EDITOR_ROLE_SLUGS)[number];

export const AUTH_AUDIT_ACTIONS = [
  "editor.login",
  "admin.seed",
  "user.status.change",
  "role.change",
  "password_reset.request",
  "password_reset.complete",
  "login.throttled",
  "game_user.admin_action"
] as const;

export type AuthAuditAction = (typeof AUTH_AUDIT_ACTIONS)[number];

export interface AccountIdentity {
  readonly id: string;
  readonly email: string;
  readonly normalizedEmail: string;
}

export interface ScopedSessionIdentity {
  readonly sessionId: string;
  readonly scope: AuthScope;
  readonly accountId: string;
  readonly expiresAt: string;
}

export interface OneTimeTokenRecord {
  readonly tokenHash: string;
  readonly expiresAt: string;
  readonly consumedAt?: string | null;
}

export interface PasswordPolicyContract {
  readonly minimumLength: 15;
  readonly supportedMaximumLengthAtLeast: 64;
  readonly allowsSpaces: true;
  readonly requiresCompositionRules: false;
  readonly requiresPeriodicRotation: false;
  readonly requiresBlocklist: true;
}

export const PASSWORD_POLICY_CONTRACT: PasswordPolicyContract = {
  minimumLength: 15,
  supportedMaximumLengthAtLeast: 64,
  allowsSpaces: true,
  requiresCompositionRules: false,
  requiresPeriodicRotation: false,
  requiresBlocklist: true
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isGameUserStatus(value: string): value is GameUserStatus {
  return (GAME_USER_STATUSES as readonly string[]).includes(value);
}