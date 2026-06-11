import type { EditorRoleSlug } from "./auth-routes.js";
import type {
  AuditEventInput,
  CreateEditorSessionInput,
  EditorAuthStore,
  EditorSessionRecord,
  EditorUserCredentialsRecord
} from "./editor-auth-store.js";

interface MysqlPool {
  execute<T = unknown>(sql: string, values?: readonly unknown[]): Promise<[T, unknown]>;
}

let defaultStore: EditorAuthStore | null | undefined;

export function getDefaultEditorAuthStore(): EditorAuthStore | null {
  if (defaultStore !== undefined) {
    return defaultStore;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    defaultStore = null;
    return defaultStore;
  }

  defaultStore = new MysqlEditorAuthStore(databaseUrl);
  return defaultStore;
}

export function resetDefaultEditorAuthStoreForTests(): void {
  defaultStore = undefined;
}

export class MysqlEditorAuthStore implements EditorAuthStore {
  #poolPromise: Promise<MysqlPool> | null = null;
  private readonly databaseUrl: string;

  constructor(databaseUrl: string) {
    this.databaseUrl = databaseUrl;
  }

  async findEditorUserByNormalizedEmail(normalizedEmail: string): Promise<EditorUserCredentialsRecord | null> {
    const rows = await this.queryRows(
      `
        SELECT
          editor_users.id,
          editor_users.normalized_email,
          editor_users.password_hash,
          editor_users.password_hash_algorithm,
          editor_users.is_active,
          editor_users.is_email_verified,
          editor_roles.slug AS role_slug
        FROM editor_users
        LEFT JOIN editor_user_roles ON editor_user_roles.editor_user_id = editor_users.id
        LEFT JOIN editor_roles ON editor_roles.id = editor_user_roles.editor_role_id
        WHERE editor_users.normalized_email = ?
      `,
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];

    if (!first) {
      return null;
    }

    return {
      id: String(first.id),
      normalizedEmail: String(first.normalized_email),
      passwordHash: String(first.password_hash),
      passwordHashAlgorithm: String(first.password_hash_algorithm),
      isActive: Boolean(first.is_active),
      isEmailVerified: Boolean(first.is_email_verified),
      roles: rows.map((row) => row.role_slug).filter(isEditorRoleSlug)
    };
  }

  async createEditorSession(input: CreateEditorSessionInput): Promise<void> {
    await this.execute(
      `
        INSERT INTO sessions (
          scope,
          editor_user_id,
          session_token_hash,
          user_agent_hash,
          ip_hash,
          expires_at
        )
        VALUES ('editor', ?, ?, ?, ?, ?)
      `,
      [
        input.editorUserId,
        input.sessionTokenHash,
        input.userAgentHash,
        input.ipHash,
        toMysqlDateTime(input.expiresAt)
      ]
    );
  }

  async findEditorSessionByTokenHash(sessionTokenHash: string, now: Date): Promise<EditorSessionRecord | null> {
    const rows = await this.queryRows(
      `
        SELECT
          sessions.id,
          sessions.editor_user_id,
          sessions.expires_at,
          sessions.revoked_at,
          editor_roles.slug AS role_slug
        FROM sessions
        JOIN editor_users ON editor_users.id = sessions.editor_user_id
        LEFT JOIN editor_user_roles ON editor_user_roles.editor_user_id = editor_users.id
        LEFT JOIN editor_roles ON editor_roles.id = editor_user_roles.editor_role_id
        WHERE sessions.scope = 'editor'
          AND sessions.session_token_hash = ?
          AND sessions.revoked_at IS NULL
          AND sessions.expires_at > ?
          AND editor_users.is_active = 1
          AND editor_users.is_email_verified = 1
      `,
      [sessionTokenHash, toMysqlDateTime(now)]
    );

    if (rows.length === 0) {
      return null;
    }

    const first = rows[0];

    if (!first) {
      return null;
    }

    return {
      id: String(first.id),
      editorUserId: String(first.editor_user_id),
      expiresAt: new Date(String(first.expires_at)),
      revokedAt: first.revoked_at ? new Date(String(first.revoked_at)) : null,
      roles: rows.map((row) => row.role_slug).filter(isEditorRoleSlug)
    };
  }

  async revokeEditorSessionByTokenHash(sessionTokenHash: string, now: Date): Promise<void> {
    await this.execute(
      `
        UPDATE sessions
        SET revoked_at = ?
        WHERE scope = 'editor'
          AND session_token_hash = ?
          AND revoked_at IS NULL
      `,
      [toMysqlDateTime(now), sessionTokenHash]
    );
  }

  async markEditorLoginSuccess(editorUserId: string, now: Date): Promise<void> {
    await this.execute(
      `
        UPDATE editor_users
        SET last_login_at = ?
        WHERE id = ?
      `,
      [toMysqlDateTime(now), editorUserId]
    );
  }

  async recordAuditEvent(input: AuditEventInput): Promise<void> {
    await this.execute(
      `
        INSERT INTO audit_log (
          actor_scope,
          actor_editor_user_id,
          actor_game_user_id,
          action,
          target_scope,
          target_id,
          ip_hash,
          metadata_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        input.actorScope,
        input.actorEditorUserId ?? null,
        input.actorGameUserId ?? null,
        input.action,
        input.targetScope,
        input.targetId ?? null,
        input.ipHash ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null
      ]
    );
  }

  private async queryRows(sql: string, values: readonly unknown[]): Promise<readonly Record<string, unknown>[]> {
    const [rows] = await this.execute<readonly Record<string, unknown>[]>(sql, values);
    return rows;
  }

  private async execute<T = unknown>(sql: string, values?: readonly unknown[]): Promise<[T, unknown]> {
    const pool = await this.getPool();
    return pool.execute<T>(sql, values);
  }

  private async getPool(): Promise<MysqlPool> {
    this.#poolPromise ??= import("mysql2/promise").then((mysql) =>
      mysql.createPool({
        uri: this.databaseUrl,
        waitForConnections: true,
        connectionLimit: Number(process.env.GK_MYSQL_POOL_LIMIT ?? 5),
        namedPlaceholders: false
      }) as MysqlPool
    );

    return this.#poolPromise;
  }
}

function isEditorRoleSlug(value: unknown): value is EditorRoleSlug {
  return value === "editor_admin";
}

function toMysqlDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
