import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { authorizeRequest, AUTH_ROUTES } from "../apps/api-server/src/auth-routes.ts";
import {
  canConsumeOneTimeToken,
  createPendingGameRegistration,
  validatePasswordPolicy
} from "../apps/api-server/src/auth-policy.ts";

const editorAdminSession = {
  scope: "editor",
  editorRoles: ["editor_admin"]
};

const editorUserSession = {
  scope: "editor",
  editorRoles: []
};

const activeGameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

describe("Fase 4 auth boundaries", () => {
  it("allows editor routes only for editor sessions", () => {
    assert.deepEqual(authorizeRequest("editor.me", editorAdminSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.me", activeGameSession), { allowed: false, reason: "wrong_scope" });
  });

  it("allows game routes only for game sessions", () => {
    assert.deepEqual(authorizeRequest("game.me", activeGameSession), { allowed: true });
    assert.deepEqual(authorizeRequest("game.me", editorAdminSession), { allowed: false, reason: "wrong_scope" });
  });

  it("requires editor admin role for game-user status management", () => {
    assert.deepEqual(authorizeRequest("editor.game_users.status_update", editorAdminSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.game_users.status_update", editorUserSession), { allowed: false, reason: "missing_role" });
    assert.deepEqual(authorizeRequest("editor.game_users.status_update", activeGameSession), { allowed: false, reason: "wrong_scope" });
  });

  it("creates game registration as pending verification", () => {
    const registration = createPendingGameRegistration("  Player@Example.COM ");

    assert.equal(registration.normalizedEmail, "player@example.com");
    assert.equal(registration.status, "pending_verification");
    assert.equal(registration.emailVerificationRequired, true);
  });

  it("keeps password policy long, passphrase-friendly and blocklist-driven", () => {
    assert.deepEqual(validatePasswordPolicy("short").issueCodes, ["password_too_short"]);
    assert.equal(validatePasswordPolicy("a long passphrase with spaces").allowed, true);
    assert.deepEqual(validatePasswordPolicy("blocked passphrase", (candidate) => candidate === "blocked passphrase").issueCodes, ["password_blocked"]);
  });

  it("keeps password reset tokens one-time and expiring", () => {
    const now = new Date("2026-06-10T12:00:00Z");

    assert.equal(canConsumeOneTimeToken({ tokenHash: "hash", expiresAt: "2026-06-10T12:05:00Z" }, now), true);
    assert.equal(canConsumeOneTimeToken({ tokenHash: "hash", expiresAt: "2026-06-10T11:59:00Z" }, now), false);
    assert.equal(canConsumeOneTimeToken({ tokenHash: "hash", expiresAt: "2026-06-10T12:05:00Z", consumedAt: "2026-06-10T12:01:00Z" }, now), false);
  });

  it("keeps all auth routes anti-enumeration aware", () => {
    assert.equal(AUTH_ROUTES.every((route) => route.avoidsAccountEnumeration), true);
  });
});

describe("Fase 4 migration safety", () => {
  const migration = readFileSync("db/migrations/0001_auth_foundation.sql", "utf8");
  const seedTemplate = readFileSync("db/seeds/0001_initial_editor_admin.sql.template", "utf8");
  const combinedSql = `${migration}\n${seedTemplate}`;

  it("defines all required auth tables", () => {
    for (const table of [
      "editor_users",
      "editor_roles",
      "editor_user_roles",
      "game_users",
      "game_user_status",
      "sessions",
      "player_profiles",
      "characters",
      "email_verification_tokens",
      "password_reset_tokens",
      "audit_log"
    ]) {
      assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    }
  });

  it("stores only token hashes in schema", () => {
    assert.match(migration, /token_hash CHAR\(64\) NOT NULL/);
    assert.doesNotMatch(migration, /\btoken_plain\b|\bplain_token\b|\bpassword_plain\b/i);
  });

  it("does not contain real credentials or generated secrets", () => {
    assert.doesNotMatch(combinedSql, /BEGIN [A-Z ]*PRIVATE KEY/);
    assert.doesNotMatch(combinedSql, /\b[A-Za-z0-9+/]{40,}={0,2}\b/);
    assert.doesNotMatch(combinedSql, /\$2[aby]\$[0-9]{2}\$/);
    assert.doesNotMatch(combinedSql, /mysql:\/\/[^_]/);
  });

  it("keeps initial admin seed dependent on outside-Git env rendering", () => {
    assert.match(seedTemplate, /\$\{GK_INITIAL_EDITOR_ADMIN_EMAIL\}/);
    assert.match(seedTemplate, /\$\{GK_INITIAL_EDITOR_ADMIN_PASSWORD_HASH\}/);
    assert.match(seedTemplate, /outside Git/i);
  });
});
