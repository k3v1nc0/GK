import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const editorUser = {
  id: "editor-1",
  normalizedEmail: "k3v1nc0@hotmail.com",
  passwordHash: "stored-outside-git",
  passwordHashAlgorithm: "outside-git-test",
  isActive: true,
  isEmailVerified: true,
  roles: ["editor_admin"]
};

const runtimeDistReady =
  existsSync("apps/api-server/dist/http-server.js") &&
  existsSync("apps/editor-web/dist/http-server.js");

async function loadApiRuntime() {
  return import("../apps/api-server/dist/http-server.js");
}

async function loadEditorRuntime() {
  return import("../apps/editor-web/dist/http-server.js");
}

class MemoryEditorAuthStore {
  constructor() {
    this.sessions = new Map();
    this.auditEvents = [];
    this.revokedTokens = new Set();
  }

  async findEditorUserByNormalizedEmail(normalizedEmail) {
    return normalizedEmail === editorUser.normalizedEmail ? editorUser : null;
  }

  async createEditorSession(input) {
    this.sessions.set(input.sessionTokenHash, {
      id: `session-${this.sessions.size + 1}`,
      editorUserId: input.editorUserId,
      roles: editorUser.roles,
      expiresAt: input.expiresAt,
      revokedAt: null
    });
  }

  async findEditorSessionByTokenHash(sessionTokenHash, now) {
    const session = this.sessions.get(sessionTokenHash) ?? null;

    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }

    return session;
  }

  async revokeEditorSessionByTokenHash(sessionTokenHash, now) {
    const session = this.sessions.get(sessionTokenHash);

    if (session) {
      this.sessions.set(sessionTokenHash, {
        ...session,
        revokedAt: now
      });
    }

    this.revokedTokens.add(sessionTokenHash);
  }

  async markEditorLoginSuccess(editorUserId, now) {
    this.lastLogin = { editorUserId, now };
  }

  async recordAuditEvent(input) {
    this.auditEvents.push(input);
  }
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function withEnv(values, callback) {
  const previous = new Map();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function cookieHeaderFromSetCookie(headers) {
  return headers
    .flatMap((header) => header.split(/,(?=\s*[^;]+=)/))
    .map((header) => header.trim().split(";")[0])
    .join("; ");
}

function readCookieFromHeader(cookieHeader, name) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(`${name}=`.length) ?? "";
}

describe("Fase 5.3 editor login flow", () => {
  it("keeps the editor shell login-first and wired to auth routes", () => {
    const source = readFileSync("apps/editor-web/src/http-server.ts", "utf8");

    assert.match(source, /id="editor-login-form"/);
    assert.match(source, /\/auth\/editor\/login/);
    assert.match(source, /\/auth\/editor\/me/);
    assert.match(source, /\/auth\/editor\/logout/);
    assert.match(source, /data-editor-login="required"/);
    assert.match(source, /data-empty-node-canvas="true"/);
    assert.match(source, /data-empty-world-preview="true"/);
    assert.doesNotMatch(source, /<img\b|<audio\b|<video\b/i);
  });

  it("implements real editor auth routes without relying on smoke headers", () => {
    const source = readFileSync("apps/api-server/src/http-server.ts", "utf8");
    const runtimeSession = readFileSync("apps/api-server/src/runtime-session.ts", "utf8");

    assert.match(source, /POST" && url\.pathname === "\/auth\/editor\/login"/);
    assert.match(source, /POST" && url\.pathname === "\/auth\/editor\/logout"/);
    assert.match(source, /GET" && url\.pathname === "\/auth\/editor\/me"/);
    assert.match(source, /createEditorSessionCookies/);
    assert.match(source, /store\.findEditorUserByNormalizedEmail/);
    assert.match(runtimeSession, /readCookie\(request, EDITOR_SESSION_COOKIE\)/);
    assert.match(runtimeSession, /findEditorSessionByTokenHash/);
  });

  it("shows the login entry before the editor shell is authenticated", { skip: !runtimeDistReady }, async () => {
    const { createEditorHttpServer } = await loadEditorRuntime();
    const server = createEditorHttpServer();
    const port = await listen(server);

    try {
      const response = await fetch(`http://127.0.0.1:${port}/editor/`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(html, /id="editor-login-form"/);
      assert.match(html, /\/auth\/editor\/login/);
      assert.match(html, /data-editor-login="required"/);
      assert.match(html, /data-empty-node-canvas="true"/);
      assert.match(html, /data-empty-world-preview="true"/);
      assert.doesNotMatch(html, /<img\b|<audio\b|<video\b/i);
    } finally {
      await close(server);
    }
  });

  it("logs in an editor admin, reads /auth/editor/me, saves GameBibleNode JSON and logs out", { skip: !runtimeDistReady }, async () => {
    const { createApiHttpServer } = await loadApiRuntime();
    const store = new MemoryEditorAuthStore();
    const verifier = async (candidatePassword) => candidatePassword === "correct editor passphrase";
    const api = createApiHttpServer({
      editorAuthStore: store,
      passwordVerifier: verifier,
      now: () => new Date("2026-06-11T12:00:00Z")
    });
    const port = await listen(api);
    const origin = `http://127.0.0.1:${port}`;
    const dir = await mkdtemp(join(tmpdir(), "gk-editor-login-"));
    const target = join(dir, "GameBibleNode.json");
    const auditLog = join(dir, "audit.log");

    await writeFile(target, `${JSON.stringify({ schema: "gamebible-node-system", nodes: [] })}\n`);

    try {
      await withEnv(
        {
          GK_ALLOWED_ORIGINS: origin,
          GK_GAMEBIBLE_NODE_JSON_PATH: target,
          GK_GAMEBIBLE_NODE_BACKUP_DIR: join(dir, ".backups"),
          GK_GAMEBIBLE_NODE_AUDIT_LOG: auditLog
        },
        async () => {
          const anonymous = await fetch(`${origin}/auth/editor/me`);
          assert.equal(anonymous.status, 401);

          const gameCookie = "gk_game_session=not-an-editor-session";
          const gameAccess = await fetch(`${origin}/editor/game-users`, {
            headers: { cookie: gameCookie }
          });
          assert.equal(gameAccess.status, 403);

          const badLogin = await fetch(`${origin}/auth/editor/login`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin
            },
            body: JSON.stringify({
              email: "missing@example.com",
              password: "wrong passphrase"
            })
          });
          assert.equal(badLogin.status, 401);
          assert.deepEqual(await badLogin.json(), { ok: false, error: "invalid_credentials" });

          const login = await fetch(`${origin}/auth/editor/login`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin
            },
            body: JSON.stringify({
              email: "K3V1NC0@HOTMAIL.COM",
              password: "correct editor passphrase"
            })
          });
          const setCookie = login.headers.getSetCookie();
          const cookie = cookieHeaderFromSetCookie(setCookie);
          const csrfToken = readCookieFromHeader(cookie, "gk_csrf");
          const sessionToken = readCookieFromHeader(cookie, "gk_editor_session");

          assert.equal(login.status, 200);
          assert.match(setCookie.join("\n"), /gk_editor_session=/);
          assert.match(setCookie.join("\n"), /HttpOnly/);
          assert.match(setCookie.join("\n"), /SameSite=Strict/);
          assert.notEqual(csrfToken, "");
          assert.notEqual(sessionToken, "");

          const me = await fetch(`${origin}/auth/editor/me`, {
            headers: { cookie }
          });
          const meBody = await me.json();
          assert.equal(me.status, 200);
          assert.equal(meBody.authenticated, true);
          assert.deepEqual(meBody.roles, ["editor_admin"]);

          const publicSave = await fetch(`${origin}/editor/game-bible-node/save`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              origin,
              "x-gk-csrf-token": csrfToken
            },
            body: JSON.stringify({ schema: "gamebible-node-system", nodes: [] })
          });
          assert.equal(publicSave.status, 403);

          const protectedSave = await fetch(`${origin}/editor/game-bible-node/save`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              cookie,
              origin,
              "x-gk-csrf-token": csrfToken
            },
            body: JSON.stringify({ schema: "gamebible-node-system", nodes: [{ id: "saved-via-editor-session" }] })
          });
          assert.equal(protectedSave.status, 200);
          assert.match(await readFile(target, "utf8"), /saved-via-editor-session/);
          assert.equal(existsSync(auditLog), true);

          const logout = await fetch(`${origin}/auth/editor/logout`, {
            method: "POST",
            headers: {
              cookie,
              origin,
              "x-gk-csrf-token": csrfToken
            }
          });
          assert.equal(logout.status, 200);
          assert.equal(store.revokedTokens.has(hashSessionToken(decodeURIComponent(sessionToken))), true);

          const afterLogout = await fetch(`${origin}/auth/editor/me`, {
            headers: { cookie }
          });
          assert.equal(afterLogout.status, 401);
        }
      );
    } finally {
      await close(api);
      await rm(dir, { recursive: true, force: true });
    }
  });
});

function hashSessionToken(token) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
