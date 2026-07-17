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

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
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

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function normalizeDeviceLabel(value) {
  const label = String(value || "").trim();
  return label ? label.slice(0, 120) : null;
}

function normalizeLoginValue(identifier) {
  const value = String(identifier || "").trim();
  if (!value) return "";
  return value.includes("@") ? normalizeEmail(value) : normalizeUsername(value);
}

function resolveRegistrationIdentity(identifier) {
  const value = String(identifier || "").trim();
  if (!value) {
    const error = new Error("Gebruikersnaam of e-mail ontbreekt.");
    error.status = 400;
    throw error;
  }
  if (value.includes("@")) {
    if (!isEmail(value)) {
      const error = new Error("E-mail heeft een ongeldig formaat.");
      error.status = 400;
      throw error;
    }
    const email = normalizeEmail(value);
    const localPart = normalizeUsername(value.split("@")[0]);
    const username = localPart || ("user_" + crypto.createHash("sha1").update(email).digest("hex").slice(0, 8));
    return { username: username, email: email };
  }
  const username = normalizeUsername(value);
  if (!username) {
    const error = new Error("Gebruikersnaam heeft een ongeldig formaat.");
    error.status = 400;
    throw error;
  }
  return { username: username, email: null };
}

export class AuthService {
  constructor(db) {
    this.db = db;
    this.cookieName = process.env.SESSION_COOKIE_NAME || "gk_editor_session";
    this.ttlHours = Number(process.env.SESSION_TTL_HOURS || 12);
    this.lastSessionTouchAt = new Map();
  }

  ensureAdmin() {
    const username = String(process.env.ADMIN_USERNAME || "kevin").trim();
    const password = String(process.env.ADMIN_PASSWORD || "");
    if (!password) {
      throw new Error("ADMIN_PASSWORD ontbreekt. Vul .env voordat de editor start.");
    }
    const existing = this.db.prepare("SELECT id FROM users WHERE username = ?").get(normalizeUsername(username));
    const salt = crypto.randomBytes(24).toString("hex");
    const passwordHash = hashPassword(password, salt);
    if (existing) {
      this.db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, role = 'admin', updated_at = ? WHERE username = ?")
        .run(passwordHash, salt, now(), normalizeUsername(username));
      return;
    }
    const createdAt = now();
    this.db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)")
      .run("user_" + crypto.randomUUID(), normalizeUsername(username), passwordHash, salt, createdAt, createdAt);
  }

  cleanupExpiredSessions() {
    this.db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now());
  }

  createSession(userId, deviceLabel) {
    const sessionId = "session_" + crypto.randomUUID();
    const sessionToken = crypto.randomBytes(32).toString("base64url");
    const createdAt = now();
    const expiresAt = hoursFromNow(this.ttlHours);
    const normalizedDeviceLabel = normalizeDeviceLabel(deviceLabel);
    this.db.prepare("INSERT INTO sessions (id, user_id, session_token_hash, device_label, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(sessionId, userId, hashSessionToken(sessionToken), normalizedDeviceLabel, createdAt, expiresAt, createdAt);
    return { sessionId, sessionToken, createdAt, expiresAt, deviceLabel: normalizedDeviceLabel };
  }

  register(identifier, password, deviceLabel) {
    const identity = resolveRegistrationIdentity(identifier);
    const passwordText = String(password || "");
    if (passwordText.length < 8) {
      const error = new Error("Wachtwoord moet minimaal 8 tekens bevatten.");
      error.status = 400;
      throw error;
    }
    const existing = this.db.prepare("SELECT id FROM users WHERE username = ? OR (email IS NOT NULL AND email = ?) LIMIT 1")
      .get(identity.username, identity.email || identity.username);
    if (existing) {
      const error = new Error("Gebruikersnaam of e-mail bestaat al.");
      error.status = 409;
      throw error;
    }
    const salt = crypto.randomBytes(24).toString("hex");
    const passwordHash = hashPassword(passwordText, salt);
    const userId = "user_" + crypto.randomUUID();
    const createdAt = now();
    this.db.prepare("INSERT INTO users (id, username, email, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'player', ?, ?)")
      .run(userId, identity.username, identity.email, passwordHash, salt, createdAt, createdAt);
    const session = this.createSession(userId, deviceLabel);
    const user = this.db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
    return { user: this.publicUser(user), sessionId: session.sessionId, sessionToken: session.sessionToken, session };
  }

  login(identifier, password, deviceLabel) {
    const loginValue = normalizeLoginValue(identifier);
    if (!loginValue) return null;
    const user = this.db.prepare("SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1").get(loginValue, loginValue);
    if (!user) return null;
    const expected = hashPassword(String(password || ""), user.password_salt);
    if (!crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(user.password_hash, "hex"))) return null;
    const session = this.createSession(user.id, deviceLabel);
    return { sessionId: session.sessionId, sessionToken: session.sessionToken, user: this.publicUser(user), session };
  }

  publicUser(row) {
    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      email: row.email || null,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  currentSessionToken(req) {
    return parseCookies(req)[this.cookieName] || "";
  }

  currentSession(req) {
    const token = this.currentSessionToken(req);
    if (!token) return null;
    const nowIso = now();
    let session = this.db.prepare("SELECT * FROM sessions WHERE session_token_hash = ? AND expires_at >= ? LIMIT 1")
      .get(hashSessionToken(token), nowIso);
    if (!session) {
      session = this.db.prepare("SELECT * FROM sessions WHERE session_token_hash IS NULL AND id = ? AND expires_at >= ? LIMIT 1")
        .get(token, nowIso);
    }
    if (!session) return null;
    const user = this.db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(session.user_id);
    if (!user) return null;
    this.touchSession(session.id);
    return { session: session, user: user };
  }

  currentSessionId(req) {
    const current = this.currentSession(req);
    return current ? current.session.id : "";
  }

  currentUser(req) {
    const current = this.currentSession(req);
    return current ? this.publicUser(current.user) : null;
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
    if (sessionId) this.lastSessionTouchAt.delete(sessionId);
  }

  touchSession(sessionId, force = false, minIntervalMs = 15000) {
    if (!sessionId) return false;
    const nowMs = Date.now();
    const lastTouch = this.lastSessionTouchAt.get(sessionId) || 0;
    if (!force && nowMs - lastTouch < minIntervalMs) return false;
    this.lastSessionTouchAt.set(sessionId, nowMs);
    this.db.prepare("UPDATE sessions SET last_seen_at = ? WHERE id = ?").run(now(), sessionId);
    return true;
  }

  countActiveSessions(userId) {
    return this.db.prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id = ? AND expires_at >= ?")
      .get(userId, now()).total;
  }

  sessionCookie(sessionToken) {
    const secure = String(process.env.COOKIE_SECURE || "false") === "true";
    return this.cookieName + "=" + encodeURIComponent(sessionToken) + "; Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "");
  }

  clearCookie() {
    return this.cookieName + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  }
}
