// Bots in de echte game (Kevin 20-11): de admin laat vanuit de game (Instellingen) groepjes bots los op deze server.
// Elke bot is een gewone speler met een echte verbinding (HTTP + websocket naar deze server), dus het verkeer en de
// serverbelasting zijn echt. De bots draaien in een apart proces (scripts/game-bots.js), zodat hun rekenwerk de
// gameloop niet ophoudt. Accounts heten bot_001, bot_002, ... (geen wachtwoord waarmee je kunt inloggen) en worden
// hergebruikt; "Alle bots weg" sluit hun verbindingen en wist hun sessies.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { allowedOrigins } from "./request-boundary.js";
import { profileServer } from "./perf-profile.js";
import { resolveDatabasePath } from "./db.js";
import { monitorEventLoopDelay } from "node:perf_hooks";

const BOT_MAX = Math.max(1, Math.min(300, Number(process.env.GK_BOTS_MAX || 100)));
const BOT_NAME = /^bot_\d{3}$/;
const BOT_EMAIL = "@bots.gk.invalid";
// Kevin 21-11: na elke groep bots vanzelf meten waar de servertijd heen gaat (eerst even laten inlopen).
const AUTO_PROFILE_AFTER_MS = 45000;
const AUTO_PROFILE_SECONDS = 15;
// Kevin 22-11: nachtlog (bots-nacht-<datum>.log in de logmap): elke 5 minuten hoe het gaat, plus start/stop.
const NIGHT_LOG_MS = 5 * 60 * 1000;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export class BotManager {
  constructor({ db, authService, mmoService, rootDir, host, port, logsDir = "", userAdmin = null }) {
    this.userAdmin = userAdmin;
    this.db = db;
    this.authService = authService;
    this.mmoService = mmoService;
    this.rootDir = rootDir;
    const localHost = !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
    this.base = "http://" + localHost + ":" + port;
    this.origin = Array.from(allowedOrigins())[0] || this.base;
    this.child = null;
    this.bots = new Map(); // userId -> { userId, name, sessionId, index }
    this.status = null;
    this.anchor = null;
    this.startedAt = 0;
    this.lastProfile = null;
    this.logsDir = logsDir || path.join(rootDir, "storage", "bot-logs");
    this.worldBuildSent = null;
    this.profileTimer = null;
    this.nightTimer = null;
    // Langste hapering (ms) van de server en van het bot-proces sinds de vorige nachtlogregel.
    this.serverLag = monitorEventLoopDelay({ resolution: 20 });
    this.serverLag.enable();
    this.botLagMaxMs = 0;
    this.dbPath = (() => { try { return resolveDatabasePath(rootDir); } catch { return ""; } })();
    // Server (opnieuw) gestart: alleen opschrijven als er al eens bots draaiden (de logmap bestaat).
    if (fs.existsSync(this.logsDir)) this.nightLine("server gestart");
  }

  nightLine(note) {
    try {
      const status = this.status || {};
      const mb = (bytes) => Math.round(bytes / 1048576);
      const size = (file) => { try { return fs.statSync(file).size; } catch { return 0; } };
      let freeGb = "";
      try {
        const disk = fs.statfsSync(this.logsDir);
        freeGb = "vrij " + (disk.bavail * disk.bsize / 1073741824).toFixed(1) + " GB";
      } catch {}
      const parts = [
        new Date().toISOString(), note,
        "bots " + this.bots.size + " (verbonden " + (Number(status.connected) || 0) + ")",
        "server " + mb(process.memoryUsage().rss) + " MB",
        status.rssMb != null ? "bots-proces " + status.rssMb + " MB" : "",
        this.dbPath ? "database " + mb(size(this.dbPath) + size(this.dbPath + "-wal")) + " MB" : "",
        freeGb,
        "hapering server " + Math.round(this.serverLag.max / 1e6) + " ms, bots " + this.botLagMaxMs + " ms",
        "kills " + (Number(status.kills) || 0) + " · quests " + (Number(status.questsDone) || 0),
        Array.isArray(status.errors) && status.errors.length ? "laatste fout: " + status.errors[status.errors.length - 1] : ""
      ].filter(Boolean);
      fs.mkdirSync(this.logsDir, { recursive: true });
      fs.appendFileSync(path.join(this.logsDir, "bots-nacht-" + new Date().toISOString().slice(0, 10) + ".log"), parts.join(" · ") + "\n");
      this.serverLag.reset();
      this.botLagMaxMs = 0;
    } catch {}
  }

  startNightLog() {
    if (this.nightTimer) return;
    this.nightTimer = setInterval(() => {
      if (!this.bots.size) {
        clearInterval(this.nightTimer);
        this.nightTimer = null;
        return;
      }
      this.nightLine("stand");
    }, NIGHT_LOG_MS);
    this.nightTimer.unref?.();
  }

  view() {
    const status = this.status || {};
    return {
      ok: true,
      max: BOT_MAX,
      running: this.bots.size,
      connected: Number(status.connected) || 0,
      kills: Number(status.kills) || 0,
      questsAccepted: Number(status.questsAccepted) || 0,
      questsDone: Number(status.questsDone) || 0,
      gathered: Number(status.gathered) || 0,
      deaths: Number(status.deaths) || 0,
      doing: status.doing || {},
      downKbPerBot: status.downKbPerBot ?? null,
      downKbPerBotMax: status.downKbPerBotMax ?? null,
      upMsgsPerBot: status.upMsgsPerBot ?? null,
      errors: Array.isArray(status.errors) ? status.errors.slice(-3) : [],
      minutes: this.startedAt ? Math.round((Date.now() - this.startedAt) / 6000) / 10 : 0,
      profile: this.lastProfile || null,
      profileSoon: Boolean(this.profileTimer),
      trace: status.trace || null
    };
  }

  // Een groepje erbij, rond de plek van de admin.
  release(req, count, options = {}) {
    const snapshot = this.mmoService.getPlayerSnapshot(req);
    const position = snapshot?.position || {};
    this.anchor = { x: Number(position.x) || 0, z: Number(position.z) || 0, zoneId: position.zoneId || null };
    const room = BOT_MAX - this.bots.size;
    if (room <= 0) throw httpError(400, "Er lopen al " + BOT_MAX + " bots (het maximum).");
    const add = Math.max(1, Math.min(room, Math.round(Number(count) || 10)));
    const fresh = [];
    for (let index = 1; fresh.length < add && index <= 999; index += 1) {
      const name = "bot_" + String(index).padStart(3, "0");
      const user = this.ensureBotUser(name);
      if (!user || this.bots.has(user.id)) continue;
      const session = this.authService.createSession(user.id, "gk-bot");
      const bot = { userId: user.id, name, sessionId: session.sessionId, index: this.bots.size };
      this.bots.set(user.id, bot);
      fresh.push({
        userId: user.id,
        name,
        sessionId: session.sessionId,
        cookie: this.authService.cookieName + "=" + session.sessionToken,
        csrf: this.authService.csrfTokenForSessionId(session.sessionId),
        // Kevin 21-11: "+1 met logboek": van deze bot schrijven we alles op wat hij doet en waar hij vastloopt.
        trace: options.trace === true && fresh.length === 0
      });
    }
    if (!fresh.length) throw httpError(400, "Geen vrije bot-accounts.");
    this.ensureChild();
    this.sendWorld();
    this.child.send({ type: "add", anchor: this.anchor, bots: fresh });
    if (!this.startedAt) this.startedAt = Date.now();
    this.nightLine("+" + fresh.length + " bots losgelaten");
    this.startNightLog();
    this.scheduleProfile();
    return this.view();
  }

  // De bots zoeken hun route zelf (zoals de game van een speler): ze krijgen dezelfde loopkaart als de server.
  sendWorld() {
    if (!this.child) return;
    let context = null;
    try { context = this.mmoService.getPublishedWorldContext(); } catch {}
    const buildId = context?.canonicalBuildId || "basis";
    if (this.worldBuildSent === buildId) return;
    this.worldBuildSent = buildId;
    try {
      this.child.send({ type: "world", buildId, index: context?.walkabilityIndex || null, solids: context?.solidColliders || [] });
    } catch (error) {
      console.error("[bots] loopkaart doorgeven mislukt:", error.message);
      try { this.child.send({ type: "world", buildId, index: null, solids: [] }); } catch {}
    }
  }

  scheduleProfile() {
    if (this.profileTimer) clearTimeout(this.profileTimer);
    this.profileTimer = setTimeout(() => {
      this.profileTimer = null;
      if (!this.bots.size) return;
      const bots = this.bots.size;
      profileServer(AUTO_PROFILE_SECONDS, this.rootDir).then((result) => {
        this.lastProfile = Object.assign({ bots, auto: true }, result);
        try {
          fs.mkdirSync(this.logsDir, { recursive: true });
          fs.writeFileSync(path.join(this.logsDir, "meting-" + bots + "-bots.json"), JSON.stringify(this.lastProfile, null, 2));
        } catch {}
      }).catch(() => {});
    }, AUTO_PROFILE_AFTER_MS);
    this.profileTimer.unref?.();
  }

  // Kevin 21-11: schone lei: alle bots weg en hun accounts helemaal wissen (zoals Verwijderen bij Gebruikers).
  // Alleen echte bot-accounts (bot_123 met ...@bots.gk.invalid en rol speler); volgende keer beginnen ze op level 1.
  wipe(adminId) {
    this.stop();
    if (!this.userAdmin) throw httpError(500, "Gebruikersbeheer ontbreekt.");
    const rows = this.db.prepare("SELECT id, username, email, role FROM users WHERE email LIKE ?").all("%" + BOT_EMAIL);
    let wiped = 0;
    for (const row of rows) {
      if (row.role !== "player" || !BOT_NAME.test(row.username || "") || row.email !== row.username + BOT_EMAIL) continue;
      this.userAdmin.remove(row.id, adminId);
      wiped += 1;
    }
    this.lastProfile = null;
    return Object.assign(this.view(), { wiped });
  }

  stop() {
    if (this.bots.size) this.nightLine("bots gestopt (" + this.bots.size + ")");
    const child = this.child;
    this.child = null;
    if (child) {
      try { child.send({ type: "stop" }); } catch {}
      setTimeout(() => { try { child.kill("SIGTERM"); } catch {} }, 2500).unref();
    }
    for (const bot of this.bots.values()) {
      // Als uitloggen (4001): meteen weg uit de wereld, zonder de 5 minuten wachttijd voor een speler die opnieuw verbindt.
      try { this.mmoService.closeSessionConnections(bot.sessionId, 4001, "logout"); } catch {}
      try { this.authService.logout(bot.sessionId); } catch {}
    }
    this.bots.clear();
    this.status = null;
    this.startedAt = 0;
    if (this.profileTimer) { clearTimeout(this.profileTimer); this.profileTimer = null; }
    return this.view();
  }

  // Bestaand bot-account hergebruiken, anders aanmaken (rol speler, willekeurig wachtwoord dat niemand kent).
  // Herkenbaar aan het e-mailadres ...@bots.gk.invalid: een echte speler die toevallig bot_001 heet blijft met rust.
  ensureBotUser(name) {
    if (!BOT_NAME.test(name)) return null;
    const email = name + BOT_EMAIL;
    const existing = this.db.prepare("SELECT id, role, email FROM users WHERE username = ? LIMIT 1").get(name);
    if (existing) return existing.role === "player" && existing.email === email ? existing : null;
    const id = "user_" + crypto.randomUUID();
    const stamp = new Date().toISOString();
    this.db.prepare("INSERT INTO users (id, username, email, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'player', ?, ?)")
      .run(id, name, email, crypto.randomBytes(32).toString("hex"), crypto.randomBytes(24).toString("hex"), stamp, stamp);
    return { id, role: "player", email };
  }

  ensureChild() {
    if (this.child && this.child.connected) return;
    const child = fork(path.join(this.rootDir, "scripts", "game-bots.js"), [], {
      cwd: this.rootDir,
      env: Object.assign({}, process.env, { GK_BOTS_BASE: this.base, GK_BOTS_ORIGIN: this.origin, GK_BOTS_LOG_DIR: this.logsDir }),
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      // Loopkaart (met getypte arrays) heel doorgeven.
      serialization: "advanced"
    });
    this.worldBuildSent = null;
    // Kevin 21-11: bots draaien op dezelfde server; de game-server gaat voor (bots krijgen pas CPU als er over is).
    try { os.setPriority(child.pid, 10); } catch {}
    child.stderr?.on("data", (data) => process.stderr.write("[bots] " + data));
    child.on("message", (message) => this.onChildMessage(message));
    child.on("exit", (code, signal) => {
      if (this.child === child) {
        // Onverwacht weg (niet via "Alle bots weg"): met reden in de nachtlog.
        this.nightLine("bot-proces onverwacht gestopt (code " + code + (signal ? ", signaal " + signal : "") + ")");
        this.child = null;
        // Proces weg (fout of gestopt): sessies opruimen, zodat er geen spookbots blijven staan.
        this.stop();
      }
    });
    this.child = child;
  }

  onChildMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "status") {
      this.status = message;
      this.botLagMaxMs = Math.max(this.botLagMaxMs, Number(message.lagMaxMs) || 0);
    }
    if (message.type === "connected") this.placeBot(message.userId);
  }

  // Net verbonden: naast de admin zetten (zelfde manier als Unstuck), in een kring zodat ze niet op elkaar staan.
  placeBot(userId) {
    const bot = this.bots.get(userId);
    if (!bot || !this.child) return;
    const ids = Array.from(this.mmoService.connectionsBySessionId?.get(bot.sessionId) || []);
    const connection = ids.map((id) => this.mmoService.connectionsById.get(id)).find((entry) => entry && !entry.closed) || null;
    const anchor = this.anchor || { x: 0, z: 0, zoneId: null };
    const angle = bot.index * 2.39996;
    const radius = 2.5 + Math.sqrt(bot.index + 1) * 1.1;
    const x = Math.round((anchor.x + Math.cos(angle) * radius) * 100) / 100;
    const z = Math.round((anchor.z + Math.sin(angle) * radius) * 100) / 100;
    let placed = null;
    if (connection) {
      try {
        const state = this.mmoService.applyTeleportState(connection, { zoneId: anchor.zoneId || undefined, position: { x, z }, animationState: "idle" }, { reason: "bots" });
        this.mmoService.schedulePersist(state, connection, true);
        placed = { x: Number(state.x), z: Number(state.z) };
      } catch {}
    }
    try { this.child.send({ type: "placed", userId, x: placed?.x ?? null, z: placed?.z ?? null, anchor }); } catch {}
  }
}
