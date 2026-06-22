import crypto from "node:crypto";

const now = function () {
  return new Date().toISOString();
};

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 210000, 64, "sha512").toString("hex");
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export class AuthService {
  constructor(db) {
    this.db = db;
    this.cookieName = process.env.SESSION_COOKIE_NAME || "gk_editor_session";
    this.ttlHours = Number(process.env.SESSION_TTL_HOURS || 12);
  }

  ensureAdmin() {
    const username = String(process.env.ADMIN_USERNAME || "kevin").trim();
    const password = String(process.env.ADMIN_PASSWORD || "");
    if (!password) {
      throw new Error("ADMIN_PASSWORD ontbreekt. Vul .env voordat de editor start.");
    }
    const existing = this.db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    const salt = crypto.randomBytes(24).toString("hex");
    const passwordHash = hashPassword(password, salt);
    if (existing) {
      this.db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, role = 'admin', updated_at = ? WHERE username = ?")
        .run(passwordHash, salt, now(), username);
      return;
    }
    this.db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)")
      .run("user_" + crypto.randomUUID(), username, passwordHash, salt, now(), now());
  }

  cleanupExpiredSessions() {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  }

  login(username, password) {
    const user = this.db.prepare("SELECT * FROM users WHERE username = ?").get(String(username || "").trim());
    if (!user) return null;
    const expected = hashPassword(String(password || ""), user.password_salt);
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(user.password_hash, "hex"))) return null;
    const sessionId = "session_" + crypto.randomUUID();
    this.db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
      .run(sessionId, user.id, now(), hoursFromNow(this.ttlHours));
    return { sessionId, user: this.publicUser(user) };
  }

  publicUser(row) {
    return { id: row.id, username: row.username, role: row.role };
  }

  currentSessionId(req) {
    return parseCookies(req)[this.cookieName] || "";
  }

  currentUser(req) {
    const sessionId = this.currentSessionId(req);
    if (!sessionId) return null;
    const row = this.db.prepare("SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.id = ? AND sessions.expires_at >= ?")
      .get(sessionId, now());
    return row ? this.publicUser(row) : null;
  }

  requireEditor(req) {
    const user = this.currentUser(req);
    if (!user || !["admin", "editor"].includes(user.role)) {
      const error = new Error("Editor login vereist.");
      error.status = 401;
      throw error;
    }
    return user;
  }

  logout(sessionId) {
    if (sessionId) this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  sessionCookie(sessionId) {
    const secure = String(process.env.COOKIE_SECURE || "false") === "true";
    return this.cookieName + "=" + encodeURIComponent(sessionId) + "; Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");
  }

  clearCookie() {
    return this.cookieName + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  }
}
