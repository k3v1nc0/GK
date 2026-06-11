import type { EditorRoleSlug } from "./auth-routes.js";

export interface EditorUserCredentialsRecord {
  readonly id: string;
  readonly normalizedEmail: string;
  readonly passwordHash: string;
  readonly passwordHashAlgorithm: string;
  readonly isActive: boolean;
  readonly isEmailVerified: boolean;
  readonly roles: readonly EditorRoleSlug[];
}

export interface EditorSessionRecord {
  readonly id: string;
  readonly editorUserId: string;
  readonly roles: readonly EditorRoleSlug[];
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface CreateEditorSessionInput {
  readonly editorUserId: string;
  readonly sessionTokenHash: string;
  readonly userAgentHash: string | null;
  readonly ipHash: string | null;
  readonly expiresAt: Date;
}

export interface AuditEventInput {
  readonly actorScope: "system" | "editor" | "game";
  readonly actorEditorUserId?: string | null;
  readonly actorGameUserId?: string | null;
  readonly action: string;
  readonly targetScope: "system" | "editor" | "game" | "session" | "token";
  readonly targetId?: string | null;
  readonly ipHash?: string | null;
  readonly metadata?: Record<string, unknown> | null;
}

export interface EditorAuthStore {
  findEditorUserByNormalizedEmail(normalizedEmail: string): Promise<EditorUserCredentialsRecord | null>;
  createEditorSession(input: CreateEditorSessionInput): Promise<void>;
  findEditorSessionByTokenHash(sessionTokenHash: string, now: Date): Promise<EditorSessionRecord | null>;
  revokeEditorSessionByTokenHash(sessionTokenHash: string, now: Date): Promise<void>;
  markEditorLoginSuccess(editorUserId: string, now: Date): Promise<void>;
  recordAuditEvent(input: AuditEventInput): Promise<void>;
}
