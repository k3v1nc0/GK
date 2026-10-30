// Instellingen > Gebruikers: accounts bekijken, naam en wachtwoord wijzigen, voortgang resetten en verwijderen.
// Alleen voor admin (de route controleert dat). Elke wijziging logt het account overal uit.
import crypto from "node:crypto";
import { hashPassword } from "./auth-service.js";

const now = () => new Date().toISOString();
const ONLINE_MS = 2 * 60 * 1000;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

export class UserAdminService {
  constructor(db, { closeSessionConnections } = {}) {
    this.db = db;
    this.closeSessionConnections = typeof closeSessionConnections === "function" ? closeSessionConnections : () => {};
  }

  // Alle tabellen met een kolom player_id (behalve het profiel zelf): daar staat de voortgang van een speler.
  playerStateTables() {
    const tables = this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
    return tables.filter((name) => name !== "player_profiles"
      && this.db.prepare("SELECT name FROM pragma_table_info(?)").all(name).some((column) => column.name === "player_id"));
  }

  list() {
    const rows = this.db.prepare(`
      SELECT u.id, u.username, u.email, u.role, u.created_at,
        (SELECT MAX(s.last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen_at,
        p.id AS player_id, p.display_name,
        (SELECT level FROM player_progression g WHERE g.player_id = p.id) AS level
        , (SELECT COUNT(*) FROM player_profiles q WHERE q.user_id = u.id) AS characters
      FROM users u LEFT JOIN player_profiles p ON p.id = COALESCE(u.active_profile_id,
        (SELECT q.id FROM player_profiles q WHERE q.user_id = u.id ORDER BY q.created_at LIMIT 1))
      ORDER BY u.role = 'player', u.username
    `).all();
    const cutoff = Date.now() - ONLINE_MS;
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      email: row.email || null,
      role: row.role,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at || null,
      online: Boolean(row.last_seen_at && Date.parse(row.last_seen_at) >= cutoff),
      playerId: row.player_id || null,
      displayName: row.display_name || null,
      level: Number.isInteger(row.level) ? row.level : null,
      characters: Number(row.characters) || 0
    }));
  }

  user(userId) {
    const row = this.db.prepare("SELECT * FROM users WHERE id = ? LIMIT 1").get(String(userId || ""));
    if (!row) throw fail(404, "Account niet gevonden.");
    return row;
  }

  logoutEverywhere(userId) {
    for (const session of this.db.prepare("SELECT id FROM sessions WHERE user_id = ?").all(userId)) {
      try { this.closeSessionConnections(session.id, 4001, "account_changed"); } catch { /* verbinding was al dicht */ }
    }
    this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  rename(userId, name) {
    const user = this.user(userId);
    const username = normalizeUsername(name);
    if (!username || username.length < 2) throw fail(400, "Naam is te kort (minstens 2 letters of cijfers).");
    if (username.length > 40) throw fail(400, "Naam is te lang (maximaal 40 tekens).");
    const taken = this.db.prepare("SELECT id FROM users WHERE username = ? AND id <> ? LIMIT 1").get(username, user.id);
    if (taken) throw fail(409, "Die naam is al in gebruik.");
    const stamp = now();
    this.db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?").run(username, stamp, user.id);
    this.db.prepare("UPDATE player_profiles SET display_name = ?, updated_at = ? WHERE user_id = ?").run(username, stamp, user.id);
    return { id: user.id, username };
  }

  async setPassword(userId, password, actorId) {
    const user = this.user(userId);
    const text = String(password || "");
    if (text.length < 8) throw fail(400, "Wachtwoord moet minimaal 8 tekens hebben.");
    if (user.role === "admin" && user.id !== actorId) throw fail(403, "Het wachtwoord van een andere admin kun je hier niet wijzigen.");
    const salt = crypto.randomBytes(24).toString("hex");
    const hash = await hashPassword(text, salt);
    this.db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?").run(hash, salt, now(), user.id);
    // Een ander account wordt uitgelogd; je eigen account blijft ingelogd.
    if (user.id !== actorId) this.logoutEverywhere(user.id);
    return { id: user.id };
  }

  // Tas, geld, quests, level, uitrusting en plek weg: bij de volgende keer inloggen begint de speler opnieuw.
  resetProgress(userId) {
    const user = this.user(userId);
    // Klassen: een account kan meerdere characters hebben (één per klasse); ze beginnen allemaal opnieuw.
    const profiles = this.db.prepare("SELECT id FROM player_profiles WHERE user_id = ?").all(user.id);
    if (!profiles.length) return { id: user.id, cleared: 0 };
    this.logoutEverywhere(user.id);
    let cleared = 0;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const table of this.playerStateTables()) {
        const statement = this.db.prepare("DELETE FROM \"" + table.replace(/"/g, "") + "\" WHERE player_id = ?");
        for (const profile of profiles) cleared += Number(statement.run(profile.id).changes || 0);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id: user.id, cleared };
  }

  remove(userId, actorId) {
    const user = this.user(userId);
    if (user.id === actorId) throw fail(403, "Je eigen account kun je niet verwijderen.");
    if (user.role === "admin") throw fail(403, "Een admin-account kun je hier niet verwijderen.");
    this.resetProgress(user.id);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM player_profiles WHERE user_id = ?").run(user.id);
      for (const table of ["editor_user_layouts"]) {
        try { this.db.prepare("DELETE FROM " + table + " WHERE user_id = ?").run(user.id); } catch { /* tabel bestaat niet */ }
      }
      this.db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);
      this.db.prepare("DELETE FROM player_connection_events WHERE user_id = ?").run(user.id);
      this.db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return { id: user.id, deleted: true };
  }
}
