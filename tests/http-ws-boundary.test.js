import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { AuthService } from "../src/server/auth-service.js";
import { allowedOrigins, assertAllowedOrigin, isMutationRequest, WS_MAX_PAYLOAD_BYTES } from "../src/server/request-boundary.js";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, email TEXT, password_hash TEXT, password_salt TEXT, role TEXT, created_at TEXT, updated_at TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, session_token_hash TEXT, device_label TEXT, created_at TEXT, expires_at TEXT, last_seen_at TEXT);
    INSERT INTO users VALUES ('user', 'player', NULL, 'x', 'x', 'player', 'now', 'now');
    INSERT INTO sessions VALUES ('session', 'user', 'token-hash', NULL, 'now', '2999-01-01T00:00:00.000Z', 'now');
  `);
  return db;
}

test("Origin-allowlist is exact en mutaties zijn herkenbaar", function () {
  const env = { ALLOWED_ORIGINS: "https://game.example,https://admin.example" };
  assert.deepEqual(Array.from(allowedOrigins(env)), ["https://game.example", "https://admin.example"]);
  assert.equal(assertAllowedOrigin({ headers: { origin: "https://game.example" } }, env), true);
  assert.throws(() => assertAllowedOrigin({ headers: { origin: "https://evil.example" } }, env), { code: "ORIGIN_FORBIDDEN", status: 403 });
  assert.throws(() => assertAllowedOrigin({ headers: {} }, env), { code: "ORIGIN_FORBIDDEN", status: 403 });
  assert.equal(isMutationRequest({ method: "PATCH" }), true);
  assert.equal(isMutationRequest({ method: "GET" }), false);
});

test("CSRF-token is sessiegebonden en ontbrekende/verkeerde tokens geven 403", function () {
  const db = database();
  try {
    const service = new AuthService(db);
    const token = service.csrfTokenForSessionId("session");
    assert.ok(token.length >= 32);
    service.csrfTokenForRequest = () => token;
    assert.equal(service.assertCsrf({ headers: { "x-gk-csrf": token } }), true);
    assert.throws(() => service.assertCsrf({ headers: {} }), { code: "CSRF_FORBIDDEN", status: 403 });
    assert.throws(() => service.assertCsrf({ headers: { "x-gk-csrf": token + "x" } }), { code: "CSRF_FORBIDDEN", status: 403 });
  } finally {
    db.close();
  }
});

test("WebSocket payloadgrens is exact 64 KiB en fout-URL is afvangbaar", function () {
  assert.equal(WS_MAX_PAYLOAD_BYTES, 65536);
  assert.throws(() => decodeURIComponent("%FF"), URIError);
});
