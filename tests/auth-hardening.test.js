import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AuthService } from "../src/server/auth-service.js";
import { assertSecureCookieConfiguration, LoginAttemptLimiter } from "../src/server/auth-security.js";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, role TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_token_hash TEXT,
      device_label TEXT, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, last_seen_at TEXT
    );
  `);
  return db;
}

function requestWithCookie(service, token) {
  return { headers: { cookie: service.cookieName + "=" + encodeURIComponent(token) } };
}

test("zesde loginpoging binnen een minuut geeft 429", function () {
  let now = 1000;
  const limiter = new LoginAttemptLimiter({ clock: () => now, limit: 5, windowMs: 60000 });
  for (let index = 0; index < 5; index += 1) assert.equal(limiter.consume("127.0.0.1", "player"), true);
  assert.throws(() => limiter.consume("127.0.0.1", "player"), { code: "LOGIN_RATE_LIMITED", status: 429 });
  now += 60001;
  assert.equal(limiter.consume("127.0.0.1", "player"), true);
});

test("sessiecookie is nooit de fallback database-ID en logout maakt token ongeldig", async function () {
  const db = database();
  try {
    const service = new AuthService(db);
    const created = await service.register("player", "password-123", "test");
    assert.equal(service.currentSession(requestWithCookie(service, created.sessionId)), null);
    assert.equal(service.currentSession(requestWithCookie(service, created.sessionToken))?.user?.username, "player");
    service.logout(created.sessionId);
    assert.equal(service.currentSession(requestWithCookie(service, created.sessionToken)), null);
  } finally {
    db.close();
  }
});

test("nieuwe login roteert de sessie en productie vereist Secure-cookie", async function () {
  const db = database();
  try {
    const service = new AuthService(db);
    const created = await service.register("player", "password-123", "first");
    const loggedIn = await service.login("player", "password-123", "second");
    assert.notEqual(created.sessionId, loggedIn.sessionId);
    assert.notEqual(created.sessionToken, loggedIn.sessionToken);
    assert.throws(() => assertSecureCookieConfiguration({ NODE_ENV: "production", COOKIE_SECURE: "false" }), { code: "SECURE_COOKIE_REQUIRED" });
    assert.equal(assertSecureCookieConfiguration({ NODE_ENV: "production", COOKIE_SECURE: "true" }), true);
  } finally {
    db.close();
  }
});
