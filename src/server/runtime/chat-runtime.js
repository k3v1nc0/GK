// MMO stap 2 (3-11): praten met elkaar (Buurt, Groep, Fluisteren) en blokkeren.
// - De server beslist wie een bericht krijgt: Buurt = online spelers in dezelfde zone binnen nearMeters,
//   Groep = je groepsleden, Fluisteren = één speler. Wie jou blokkeerde, krijgt niets.
// - Spam-rem: hooguit perTenSeconds berichten per 10 s, en niet direct hetzelfde bericht nog eens.
// - Woorden uit de lijst worden ***. De tekst gaat als gewone tekst naar de game (nooit als HTML).
// - Blokkeren blijft bewaard (tabel player_blocks). Berichten zelf worden niet opgeslagen.
// Werkbank Fase 10: dempen (player_mutes: je ziet hun chat niet meer, de rest kan nog) en melden bij de maker
// (player_reports, met de laatste berichten van die speler die de melder kreeg; die houdt de server even in geheugen).
import { chatBadWords, chatValues } from "../../shared/authoring/kinds/chat.js";

export const CHAT_CHANNELS = Object.freeze(["near", "party", "whisper"]);
const WINDOW_MS = 10000;
const SAME_TEXT_MS = 5000;
// Werkbank Fase 10: waarom je iemand meldt (de admin ziet de tekst in de editor).
export const REPORT_REASONS = Object.freeze({ abuse: "Schelden of pesten", spam: "Spam", cheat: "Vals spelen", name: "Nare naam", other: "Iets anders" });
const REPORT_KEEP_MS = 15 * 60000;   // zo lang onthoudt de server de laatste berichten (alleen in geheugen)
const REPORT_KEEP_LINES = 12;        // per speler hooguit zoveel berichten
const REPORT_WINDOW_MS = 10 * 60000; // hooguit REPORT_MAX meldingen per 10 minuten per speler
const REPORT_MAX = 5;
const REPORT_SAME_MS = 30 * 60000;   // dezelfde speler nog eens melden kan pas na 30 minuten

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function chatRulesFromProject(project) {
  const rules = project?.playerRules?.byType?.chat_rules;
  return chatValues(Array.isArray(rules) && rules[0] ? rules[0] : null);
}

// Geen stuurtekens of onzichtbare tekens, witruimte samen, hooguit maxLength tekens (emoji tellen als één).
export function cleanChatText(raw, maxLength = 160) {
  const text = String(raw ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > maxLength ? chars.slice(0, maxLength).join("").trim() : text;
}

const ESCAPE = /[.*+?^${}()|[\]\\]/g;
// Hele woorden wegsterren (hoofdletters maken niet uit). "woord*" vangt ook langere woorden die zo beginnen.
export function wordPatterns(words) {
  return words.map((word) => {
    const open = word.endsWith("*");
    const core = (open ? word.slice(0, -1) : word).replace(ESCAPE, "\\$&");
    if (!core) return null;
    return new RegExp("(^|[^\\p{L}\\p{N}])(" + core + (open ? "[\\p{L}\\p{N}]*" : "") + ")(?=$|[^\\p{L}\\p{N}])", "giu");
  }).filter(Boolean);
}
export function starWords(text, patterns) {
  let out = text;
  for (const pattern of patterns) out = out.replace(pattern, (match, before, hit) => before + "*".repeat(Array.from(hit).length));
  return out;
}

// host: { db, project(), playerStates(worldId), connectionFor(playerId), sendToPlayer(playerId, payload), partyMemberIds(playerId) }
export class ChatRuntime {
  constructor(host) {
    this.host = host;
    this.seq = 0;
    this.sentAt = new Map();    // playerId -> tijden van de laatste berichten
    this.lastText = new Map();  // playerId -> { text, at }
    this.blocks = new Map();    // playerId -> Set van wie hij blokkeerde
    this.mutes = new Map();     // playerId -> Set van wie hij dempte
    this.recent = new Map();    // playerId -> laatste berichten { at, channel, text, to: Set } (voor een melding)
    this.reportedAt = new Map(); // playerId -> tijden van zijn laatste meldingen
    this.words = { key: null, patterns: [] };
    this.perf = { messages: 0, refused: 0 };
  }

  rules() {
    try { return chatRulesFromProject(this.host.project() || {}); } catch { return chatValues(null); }
  }

  patterns(rules) {
    const key = String(rules.badWords || "");
    if (this.words.key !== key) this.words = { key, patterns: wordPatterns(chatBadWords(rules)) };
    return this.words.patterns;
  }

  send(playerId, payload) {
    try { return this.host.sendToPlayer(playerId, payload) !== false; } catch { return false; }
  }

  online(playerId) {
    try { return Boolean(this.host.connectionFor(playerId)); } catch { return false; }
  }

  profile(playerId) {
    if (!playerId) return null;
    return this.host.db.prepare("SELECT id, display_name FROM player_profiles WHERE id = ? LIMIT 1").get(playerId) || null;
  }

  findByName(name) {
    if (!name) return null;
    const rows = this.host.db.prepare("SELECT id, display_name FROM player_profiles WHERE display_name = ? COLLATE NOCASE LIMIT 5").all(name);
    return rows.find((row) => this.online(row.id)) || rows[0] || null;
  }

  blockedBy(playerId) {
    if (!this.blocks.has(playerId)) {
      const rows = this.host.db.prepare("SELECT blocked_player_id FROM player_blocks WHERE player_id = ?").all(playerId);
      this.blocks.set(playerId, new Set(rows.map((row) => row.blocked_player_id)));
    }
    return this.blocks.get(playerId);
  }

  // Heeft playerId de speler otherId geblokkeerd?
  hasBlocked(playerId, otherId) {
    if (!playerId || !otherId) return false;
    try { return this.blockedBy(playerId).has(otherId); } catch { return false; }
  }

  refuse(playerId, text) {
    this.perf.refused += 1;
    this.send(playerId, { type: "chat:error", text });
    return { ok: false, message: text };
  }

  // Een bericht van de game: { type: "chat:send", payload: { channel, text, toId?, toName? } } of chat:block.
  handle(connection, message) {
    const me = connection?.player;
    if (!me?.id) return null;
    const payload = message?.payload && typeof message.payload === "object" ? message.payload : {};
    if (message.type === "chat:block") return this.setBlock(me.id, String(payload.playerId || ""), payload.on !== false);
    if (message.type === "chat:mute") return this.setMute(me.id, String(payload.playerId || ""), payload.on !== false);
    if (message.type === "chat:report") return this.report(me, connection.worldId, String(payload.playerId || ""), String(payload.reason || ""));
    return this.say(me, connection.worldId, payload);
  }

  say(me, worldId, payload = {}) {
    const rules = this.rules();
    const channel = CHAT_CHANNELS.includes(payload.channel) ? payload.channel : "near";
    const text = starWords(cleanChatText(payload.text, rules.maxLength), this.patterns(rules));
    if (!text) return this.refuse(me.id, "Typ eerst een bericht.");
    const nowMs = Date.now();
    const times = (this.sentAt.get(me.id) || []).filter((at) => nowMs - at < WINDOW_MS);
    this.sentAt.set(me.id, times);
    if (times.length >= rules.perTenSeconds) {
      const waitS = Math.max(1, Math.ceil((WINDOW_MS - (nowMs - times[0])) / 1000));
      return this.refuse(me.id, "Rustig aan: over " + waitS + " s kun je weer een bericht sturen.");
    }
    const last = this.lastText.get(me.id);
    if (last && last.text === text && nowMs - last.at < SAME_TEXT_MS) return this.refuse(me.id, "Dat bericht stuurde je net al.");

    let recipients = [];
    let to = null;
    if (channel === "near") {
      recipients = this.nearIds(me.id, worldId, rules.nearMeters);
    } else if (channel === "party") {
      const ids = typeof this.host.partyMemberIds === "function" ? this.host.partyMemberIds(me.id) || [] : [];
      if (!ids.length) return this.refuse(me.id, "Je zit niet in een groep. Kies Buurt of Fluisteren.");
      recipients = ids.filter((id) => id !== me.id && this.online(id));
    } else {
      const wantedName = String(payload.toName || "").trim().slice(0, 40);
      const target = payload.toId ? this.profile(String(payload.toId)) : this.findByName(wantedName);
      if (!target) return this.refuse(me.id, wantedName ? "Speler " + wantedName + " niet gevonden." : "Kies eerst aan wie je fluistert.");
      const name = target.display_name || "Speler";
      if (target.id === me.id) return this.refuse(me.id, "Je kunt niet naar jezelf fluisteren.");
      if (this.hasBlocked(me.id, target.id)) return this.refuse(me.id, "Je hebt " + name + " geblokkeerd. Deblokkeer eerst (spelermenu).");
      if (!this.online(target.id)) return this.refuse(me.id, name + " is niet online.");
      if (this.hasBlocked(target.id, me.id)) return this.refuse(me.id, name + " wil geen berichten van jou.");
      to = { id: target.id, name };
      recipients = [target.id];
    }

    times.push(nowMs);
    this.lastText.set(me.id, { text, at: nowMs });
    let fromName = me.display_name || "";
    if (!fromName) fromName = this.profile(me.id)?.display_name || "Speler";
    const entry = { id: "c" + nowMs.toString(36) + "_" + (++this.seq), channel, fromId: me.id, fromName, text, at: nowMs };
    if (to) Object.assign(entry, { toId: to.id, toName: to.name });
    let heard = 0;
    const delivered = new Set();
    for (const id of new Set(recipients)) {
      if (id === me.id || this.hasBlocked(id, me.id) || this.hasMuted(id, me.id)) continue;
      if (this.send(id, { type: "chat:message", message: entry })) { heard += 1; delivered.add(id); }
    }
    this.remember(me.id, entry, delivered, nowMs);
    this.send(me.id, { type: "chat:message", message: entry, heard });
    this.perf.messages += 1;
    return { ok: true, message: entry, heard };
  }

  // Online spelers in dezelfde wereld en zone, binnen meters (de plek die de server kent).
  nearIds(playerId, worldId, meters) {
    const states = this.host.playerStates(worldId) || [];
    const mine = states.find((state) => state?.player_id === playerId);
    if (!mine) return [];
    const zone = mine.current_zone_id || null;
    const out = [];
    for (const state of states) {
      const id = state?.player_id;
      if (!id || id === playerId || (state.current_zone_id || null) !== zone) continue;
      if (Math.hypot(num(state.x) - num(mine.x), num(state.z) - num(mine.z)) > meters) continue;
      if (this.online(id)) out.push(id);
    }
    return out;
  }

  setBlock(playerId, otherId, on) {
    if (!otherId || otherId === playerId) return this.refuse(playerId, "Kies een andere speler.");
    const other = this.profile(otherId);
    if (!other) return this.refuse(playerId, "Speler niet gevonden.");
    const name = other.display_name || "Speler";
    if (on) this.host.db.prepare("INSERT OR IGNORE INTO player_blocks (player_id, blocked_player_id, created_at) VALUES (?, ?, ?)").run(playerId, otherId, new Date().toISOString());
    else this.host.db.prepare("DELETE FROM player_blocks WHERE player_id = ? AND blocked_player_id = ?").run(playerId, otherId);
    this.blocks.delete(playerId);
    this.sendBlocks(playerId);
    // Werkbank Fase 10: blokkeren haalt ook de vriendschap (of het verzoek) weg.
    if (on && typeof this.host.onBlock === "function") { try { this.host.onBlock(playerId, otherId); } catch { /* vriendenlijst is niet kritiek */ } }
    this.send(playerId, { type: "chat:notice", text: on ? name + " is geblokkeerd: je ziet geen berichten meer en krijgt geen uitnodigingen." : name + " is niet meer geblokkeerd." });
    return { ok: true };
  }

  // ---- Werkbank Fase 10: dempen ----
  mutedBy(playerId) {
    if (!this.mutes.has(playerId)) {
      const rows = this.host.db.prepare("SELECT muted_player_id FROM player_mutes WHERE player_id = ?").all(playerId);
      this.mutes.set(playerId, new Set(rows.map((row) => row.muted_player_id)));
    }
    return this.mutes.get(playerId);
  }

  // Heeft playerId de speler otherId gedempt?
  hasMuted(playerId, otherId) {
    if (!playerId || !otherId) return false;
    try { return this.mutedBy(playerId).has(otherId); } catch { return false; }
  }

  setMute(playerId, otherId, on) {
    if (!otherId || otherId === playerId) return this.refuse(playerId, "Kies een andere speler.");
    const other = this.profile(otherId);
    if (!other) return this.refuse(playerId, "Speler niet gevonden.");
    const name = other.display_name || "Speler";
    if (on) this.host.db.prepare("INSERT OR IGNORE INTO player_mutes (player_id, muted_player_id, created_at) VALUES (?, ?, ?)").run(playerId, otherId, new Date().toISOString());
    else this.host.db.prepare("DELETE FROM player_mutes WHERE player_id = ? AND muted_player_id = ?").run(playerId, otherId);
    this.mutes.delete(playerId);
    this.sendMutes(playerId);
    this.send(playerId, { type: "chat:notice", text: on ? name + " is gedempt: je ziet zijn berichten niet meer. Uitnodigen, ruilen en post kan nog (voor alles uit: Blokkeren)." : name + " is niet meer gedempt." });
    return { ok: true };
  }

  muteList(playerId) {
    return this.host.db.prepare(`
      SELECT m.muted_player_id AS id, p.display_name AS name FROM player_mutes m
      LEFT JOIN player_profiles p ON p.id = m.muted_player_id
      WHERE m.player_id = ? ORDER BY m.created_at, m.muted_player_id
    `).all(playerId).map((row) => ({ id: row.id, name: row.name || "Speler" }));
  }

  sendMutes(playerId) {
    this.send(playerId, { type: "chat:mutes", mutes: this.muteList(playerId) });
  }

  // ---- Werkbank Fase 10: melden bij de maker ----
  // De laatste berichten per speler, met wie ze kreeg (alleen in geheugen, een kwartier).
  remember(playerId, entry, delivered, nowMs) {
    const lines = (this.recent.get(playerId) || []).filter((line) => nowMs - line.at < REPORT_KEEP_MS);
    lines.push({ at: nowMs, channel: entry.channel, text: entry.text, to: delivered });
    this.recent.set(playerId, lines.slice(-REPORT_KEEP_LINES));
  }

  report(me, worldId, otherId, reason) {
    if (!otherId || otherId === me.id) return this.refuse(me.id, "Kies een andere speler.");
    const other = this.profile(otherId);
    if (!other) return this.refuse(me.id, "Speler niet gevonden.");
    const name = other.display_name || "Speler";
    const why = REPORT_REASONS[reason] ? reason : "other";
    const nowMs = Date.now();
    const times = (this.reportedAt.get(me.id) || []).filter((at) => nowMs - at < REPORT_WINDOW_MS);
    if (times.length >= REPORT_MAX) return this.refuse(me.id, "Je hebt net al een paar meldingen gedaan. Probeer het later nog eens.");
    const since = new Date(nowMs - REPORT_SAME_MS).toISOString();
    const again = this.host.db.prepare("SELECT 1 FROM player_reports WHERE reporter_player_id = ? AND reported_player_id = ? AND created_at > ? LIMIT 1").get(me.id, otherId, since);
    if (again) return this.refuse(me.id, "Je meldde " + name + " net al. De maker kijkt ernaar.");
    const chat = (this.recent.get(otherId) || []).filter((line) => nowMs - line.at < REPORT_KEEP_MS && line.to.has(me.id))
      .map((line) => ({ at: new Date(line.at).toISOString(), channel: line.channel, text: line.text }));
    let where = null;
    try { where = (this.host.playerStates(worldId) || []).find((state) => state?.player_id === me.id) || null; } catch { where = null; }
    this.host.db.prepare(`
      INSERT INTO player_reports (reporter_player_id, reported_player_id, reason, chat_json, world_id, x, z, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
    `).run(me.id, otherId, why, JSON.stringify(chat), worldId || null, where ? num(where.x) : null, where ? num(where.z) : null, new Date(nowMs).toISOString());
    times.push(nowMs);
    this.reportedAt.set(me.id, times);
    this.send(me.id, { type: "chat:notice", text: "Bedankt. Je melding over " + name + " is bij de maker. Wil je " + name + " niet meer zien of horen? Kies Dempen of Blokkeren." });
    return { ok: true };
  }

  // Voor de admin (editor > Instellingen > Gebruikers): eerst de open meldingen, daarna de laatste afgehandelde.
  adminReports() {
    const rows = this.host.db.prepare(`
      SELECT r.*, a.display_name AS reporter_name, b.display_name AS reported_name FROM player_reports r
      LEFT JOIN player_profiles a ON a.id = r.reporter_player_id
      LEFT JOIN player_profiles b ON b.id = r.reported_player_id
      WHERE r.status = 'open' OR r.id IN (SELECT id FROM player_reports WHERE status = 'done' ORDER BY handled_at DESC LIMIT 20)
      ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC LIMIT 200
    `).all();
    return rows.map((row) => {
      let chat = [];
      try { chat = JSON.parse(row.chat_json || "[]"); } catch { chat = []; }
      return { id: row.id, status: row.status, reason: row.reason, reasonText: REPORT_REASONS[row.reason] || row.reason,
        reporterId: row.reporter_player_id, reporterName: row.reporter_name || "Speler", reportedId: row.reported_player_id, reportedName: row.reported_name || "Speler",
        chat: Array.isArray(chat) ? chat : [], x: row.x, z: row.z, createdAt: row.created_at, handledAt: row.handled_at || null, handledBy: row.handled_by || null };
    });
  }

  markReportDone(id, by) {
    const result = this.host.db.prepare("UPDATE player_reports SET status = 'done', handled_at = ?, handled_by = ? WHERE id = ? AND status = 'open'")
      .run(new Date().toISOString(), String(by || ""), Number(id) || 0);
    if (!result.changes) {
      const error = new Error("Die melding is er niet (meer), of al afgehandeld.");
      error.status = 404;
      throw error;
    }
    return { id: Number(id) };
  }

  blockList(playerId) {
    return this.host.db.prepare(`
      SELECT b.blocked_player_id AS id, p.display_name AS name FROM player_blocks b
      LEFT JOIN player_profiles p ON p.id = b.blocked_player_id
      WHERE b.player_id = ? ORDER BY b.created_at, b.blocked_player_id
    `).all(playerId).map((row) => ({ id: row.id, name: row.name || "Speler" }));
  }

  sendBlocks(playerId) {
    this.send(playerId, { type: "chat:blocks", blocks: this.blockList(playerId) });
  }

  // Bij (her)verbinden: wie je blokkeerde (de game verbergt hun berichten en zet Deblokkeren in het menu).
  sendTo(playerId) {
    if (!playerId) return;
    this.blocks.delete(playerId);
    this.mutes.delete(playerId);
    this.sendBlocks(playerId);
    this.sendMutes(playerId);
  }

  snapshotForDebug() {
    return Object.assign({}, this.perf);
  }
}
