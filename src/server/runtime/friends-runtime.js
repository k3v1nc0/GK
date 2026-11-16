// Werkbank Fase 10 (Kevin 15-11: "een vriendenlijst moet er echt in"): vrienden per account (player_profiles).
// - Toevoegen op naam of uit het spelermenu; de ander accepteert (dan zijn jullie vrienden) of weigert.
// - Je ziet welke vriend online is; komt een vriend online, dan krijg je een seintje (niet bij even herladen).
// - Wie jou blokkeerde kan je geen verzoek sturen; blokkeren haalt de vriendschap weg (zie ChatRuntime onBlock).
export const FRIENDS_MAX = 100;
const ONLINE_NOTICE_GAP_MS = 120000;

// host: { db, connectionFor(playerId), sendToPlayer(playerId, payload), hasBlocked(playerId, otherId) }
export class FriendsRuntime {
  constructor(host) {
    this.host = host;
    this.lastSeen = new Map(); // playerId -> laatste keer online of offline gegaan (tegen seintjes bij herladen)
  }

  send(playerId, payload) {
    try { return this.host.sendToPlayer(playerId, payload) !== false; } catch { return false; }
  }

  online(playerId) {
    try { return Boolean(this.host.connectionFor(playerId)); } catch { return false; }
  }

  blocked(playerId, otherId) {
    try { return typeof this.host.hasBlocked === "function" && this.host.hasBlocked(playerId, otherId); } catch { return false; }
  }

  notice(playerId, text, tone = "") {
    this.send(playerId, { type: "friends:notice", text, tone });
  }

  profile(playerId) {
    return playerId ? this.host.db.prepare("SELECT id, display_name FROM player_profiles WHERE id = ? LIMIT 1").get(playerId) || null : null;
  }

  findByName(name) {
    return name ? this.host.db.prepare("SELECT id, display_name FROM player_profiles WHERE display_name = ? COLLATE NOCASE LIMIT 1").get(name) || null : null;
  }

  row(playerId, otherId) {
    return this.host.db.prepare(`
      SELECT player_id, friend_player_id, status FROM player_friends
      WHERE (player_id = ? AND friend_player_id = ?) OR (player_id = ? AND friend_player_id = ?) LIMIT 1
    `).get(playerId, otherId, otherId, playerId) || null;
  }

  // [{ id, name, state: friend | in (hij vroeg jou) | out (jij vroeg hem), online }], online vrienden bovenaan.
  list(playerId) {
    const rows = this.host.db.prepare(`
      SELECT f.player_id AS from_id, f.status AS status, p.id AS other_id, p.display_name AS name FROM player_friends f
      JOIN player_profiles p ON p.id = CASE WHEN f.player_id = ? THEN f.friend_player_id ELSE f.player_id END
      WHERE f.player_id = ? OR f.friend_player_id = ?
    `).all(playerId, playerId, playerId);
    const order = { in: 0, friend: 1, out: 2 };
    return rows.map((row) => {
      const state = row.status === "accepted" ? "friend" : row.from_id === playerId ? "out" : "in";
      return { id: row.other_id, name: row.name || "Speler", state, online: state === "friend" && this.online(row.other_id) };
    }).sort((a, b) => order[a.state] - order[b.state] || Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
  }

  sendTo(playerId) {
    if (playerId) this.send(playerId, { type: "friends:list", friends: this.list(playerId) });
  }

  friendIds(playerId) {
    return this.host.db.prepare(`
      SELECT CASE WHEN player_id = ? THEN friend_player_id ELSE player_id END AS id FROM player_friends
      WHERE status = 'accepted' AND (player_id = ? OR friend_player_id = ?)
    `).all(playerId, playerId, playerId).map((row) => row.id);
  }

  // { type: "friend:add", payload: { name } of { playerId } }, friend:accept en friend:remove ({ playerId }).
  handle(connection, message) {
    const me = connection?.player;
    if (!me?.id) return null;
    const payload = message?.payload && typeof message.payload === "object" ? message.payload : {};
    if (message.type === "friend:add") return this.add(me.id, payload);
    if (message.type === "friend:accept") return this.accept(me.id, String(payload.playerId || ""));
    if (message.type === "friend:remove") return this.remove(me.id, String(payload.playerId || ""));
    return null;
  }

  add(playerId, payload) {
    const wantedName = String(payload.name || "").trim().slice(0, 40);
    const other = payload.playerId ? this.profile(String(payload.playerId)) : this.findByName(wantedName);
    if (!other) { this.notice(playerId, wantedName ? "Speler " + wantedName + " niet gevonden." : "Typ de naam van een speler.", "error"); return { ok: false }; }
    const name = other.display_name || "Speler";
    if (other.id === playerId) { this.notice(playerId, "Dat ben je zelf.", "error"); return { ok: false }; }
    if (this.blocked(playerId, other.id)) { this.notice(playerId, "Je hebt " + name + " geblokkeerd. Deblokkeer eerst (spelermenu).", "error"); return { ok: false }; }
    if (this.blocked(other.id, playerId)) { this.notice(playerId, name + " wil geen verzoeken van jou.", "error"); return { ok: false }; }
    const existing = this.row(playerId, other.id);
    if (existing?.status === "accepted") { this.notice(playerId, name + " is al je vriend."); return { ok: true }; }
    if (existing && existing.player_id === playerId) { this.notice(playerId, "Je verzoek aan " + name + " staat nog open."); return { ok: true }; }
    // Hij vroeg jou al: dan zijn jullie nu vrienden.
    if (existing) return this.accept(playerId, other.id);
    const count = this.host.db.prepare("SELECT COUNT(*) AS total FROM player_friends WHERE player_id = ? OR friend_player_id = ?").get(playerId, playerId).total;
    if (count >= FRIENDS_MAX) { this.notice(playerId, "Je vriendenlijst is vol (" + FRIENDS_MAX + "). Haal eerst iemand weg.", "error"); return { ok: false }; }
    const at = new Date().toISOString();
    this.host.db.prepare("INSERT INTO player_friends (player_id, friend_player_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)").run(playerId, other.id, at, at);
    const myName = this.profile(playerId)?.display_name || "Iemand";
    this.sendTo(playerId);
    this.sendTo(other.id);
    this.notice(playerId, "Verzoek gestuurd aan " + name + ". Jullie zijn vrienden zodra " + name + " het accepteert.");
    this.notice(other.id, myName + " wil je vriend worden. Kijk bij 👥 Vrienden (toets O).");
    return { ok: true };
  }

  accept(playerId, otherId) {
    const existing = otherId ? this.row(playerId, otherId) : null;
    if (!existing || existing.status !== "pending" || existing.friend_player_id !== playerId) { this.notice(playerId, "Dat verzoek is er niet meer.", "error"); this.sendTo(playerId); return { ok: false }; }
    this.host.db.prepare("UPDATE player_friends SET status = 'accepted', updated_at = ? WHERE player_id = ? AND friend_player_id = ?").run(new Date().toISOString(), otherId, playerId);
    const myName = this.profile(playerId)?.display_name || "Iemand";
    const name = this.profile(otherId)?.display_name || "Speler";
    this.sendTo(playerId);
    this.sendTo(otherId);
    this.notice(playerId, "Jij en " + name + " zijn nu vrienden.");
    this.notice(otherId, myName + " is nu je vriend.");
    return { ok: true };
  }

  // Vriend weghalen, verzoek intrekken of weigeren: de rij gaat weg, en beiden krijgen hun nieuwe lijst.
  remove(playerId, otherId, quiet = false) {
    const existing = otherId ? this.row(playerId, otherId) : null;
    if (!existing) { if (!quiet) this.sendTo(playerId); return { ok: false }; }
    this.host.db.prepare("DELETE FROM player_friends WHERE (player_id = ? AND friend_player_id = ?) OR (player_id = ? AND friend_player_id = ?)").run(playerId, otherId, otherId, playerId);
    this.sendTo(playerId);
    this.sendTo(otherId);
    if (!quiet) {
      const name = this.profile(otherId)?.display_name || "Speler";
      this.notice(playerId, existing.status === "accepted" ? name + " staat niet meer in je vriendenlijst." : existing.player_id === playerId ? "Verzoek aan " + name + " ingetrokken." : "Verzoek van " + name + " geweigerd.");
    }
    return { ok: true };
  }

  // Komt iemand online of gaat hij offline: zijn vrienden krijgen hun lijst opnieuw (🟢/⚪), en bij online een seintje.
  presenceChanged(playerId, online) {
    if (!playerId) return;
    const nowMs = Date.now();
    const announce = online && nowMs - (this.lastSeen.get(playerId) || 0) > ONLINE_NOTICE_GAP_MS;
    this.lastSeen.set(playerId, nowMs);
    let name = null;
    for (const friendId of this.friendIds(playerId)) {
      if (!this.online(friendId)) continue;
      this.sendTo(friendId);
      if (announce) {
        if (name === null) name = this.profile(playerId)?.display_name || "Een vriend";
        this.notice(friendId, "👥 " + name + " is online.");
      }
    }
  }
}
