// MMO (3-11): groepen live naar de leden (stap 1 van de MMO-lijst).
// - Eén keer per seconde (in de worldtick) per groep één query: naam, klasse, level, levens, mana, online.
//   Alleen als er iets veranderde gaat er een klein "party:state"-bericht naar de leden die online zijn.
// - Na uitnodigen, meedoen, nee of verlaten stuurt de server meteen de nieuwe stand (na de database-transactie,
//   en altijd de stand zoals die dan in de database staat).
// - Bij (her)verbinden: je groep en je openstaande uitnodigingen.
import { partyValues } from "../../shared/authoring/kinds/party.js";

const TICK_MS = 1000;
const CACHE_MS = 30000;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function partyRulesFromProject(project) {
  const rules = project?.playerRules?.byType?.party_rules;
  return partyValues(Array.isArray(rules) && rules[0] ? rules[0] : null);
}

// host: { db, project(), playerStates(worldId), connectionFor(playerId, worldId?), sendToPlayer(playerId, payload),
//         modelFor(profileRow)?, defer(fn)? }
export class PartyRuntime {
  constructor(host) {
    this.host = host;
    this.partyOf = new Map();   // playerId -> partyId | null
    this.sent = new Map();      // partyId -> laatst verstuurde stand
    this.lastTickAtMs = 0;
    this.cacheAt = 0;
    this.perf = { ticks: 0, pushes: 0 };
  }

  project() {
    try { return this.host.project() || {}; } catch { return {}; }
  }

  rules() {
    return partyRulesFromProject(this.project());
  }

  online(playerId, worldId = null) {
    try { return Boolean(this.host.connectionFor(playerId, worldId)); } catch { return false; }
  }

  later(fn) {
    const run = () => { try { fn(); } catch (error) { console.error("[groep] bijwerken mislukt:", error.message); } };
    if (typeof this.host.defer === "function") this.host.defer(run);
    else setTimeout(run, 0);
  }

  send(playerId, payload) {
    try { return this.host.sendToPlayer(playerId, payload) !== false; } catch { return false; }
  }

  partyIdFor(playerId) {
    if (!playerId) return null;
    if (this.partyOf.has(playerId)) return this.partyOf.get(playerId);
    const row = this.host.db.prepare(`
      SELECT pm.party_id FROM party_members pm JOIN parties p ON p.id = pm.party_id
      WHERE pm.player_id = ? AND pm.left_at IS NULL AND p.disbanded_at IS NULL LIMIT 1
    `).get(playerId);
    const partyId = row?.party_id || null;
    this.partyOf.set(playerId, partyId);
    return partyId;
  }

  // Alle leden van de groep van deze speler (ook hijzelf; leeg = geen groep). Voor de groepschat.
  memberIds(playerId) {
    const partyId = this.partyIdFor(playerId);
    if (!partyId) return [];
    return this.host.db.prepare("SELECT player_id FROM party_members WHERE party_id = ? AND left_at IS NULL").all(partyId).map((row) => row.player_id);
  }

  // De groep zoals de leden hem zien (null = geen groep).
  view(partyId) {
    if (!partyId) return null;
    const db = this.host.db;
    const party = db.prepare("SELECT id, leader_player_id, invite_rule, disbanded_at FROM parties WHERE id = ? LIMIT 1").get(partyId);
    if (!party || party.disbanded_at) return null;
    const rows = db.prepare(`
      SELECT pm.player_id, pp.display_name, pp.selected_character_id, pp.model_asset_id, pr.level,
        hs.base_value AS hp_base, hs.earned_value AS hp_earned, hs.current_value AS hp_cur,
        ms.base_value AS mp_base, ms.earned_value AS mp_earned, ms.current_value AS mp_cur
      FROM party_members pm
      JOIN player_profiles pp ON pp.id = pm.player_id
      LEFT JOIN player_progression pr ON pr.player_id = pm.player_id
      LEFT JOIN player_stats hs ON hs.player_id = pm.player_id AND hs.stat_id = 'stat.health'
      LEFT JOIN player_stats ms ON ms.player_id = pm.player_id AND ms.stat_id = 'stat.mana'
      WHERE pm.party_id = ? AND pm.left_at IS NULL
      ORDER BY CASE WHEN pm.player_id = ? THEN 0 ELSE 1 END, pm.joined_at, pm.player_id
    `).all(partyId, party.leader_player_id);
    if (!rows.length) return null;
    const characters = this.project().catalogs?.playableCharacters || {};
    const rules = this.rules();
    const vital = (base, earned, current) => {
      const max = Math.max(0, num(base) + num(earned));
      return { max, cur: current === null || current === undefined ? max : Math.max(0, Math.min(max, num(current, max))) };
    };
    return {
      partyId,
      leaderId: party.leader_player_id,
      maxMembers: rules.maxMembers,
      whoCanInvite: party.invite_rule === "all" || party.invite_rule === "leader" ? party.invite_rule : rules.whoCanInvite,
      members: rows.map((row) => {
        const character = characters[row.selected_character_id] || null;
        const hp = vital(row.hp_base, row.hp_earned, row.hp_cur);
        const mp = vital(row.mp_base, row.mp_earned, row.mp_cur);
        let modelAssetId = null;
        try { modelAssetId = this.host.modelFor ? this.host.modelFor(row) || null : null; } catch {}
        return {
          id: row.player_id,
          name: row.display_name || "Speler",
          classId: row.selected_character_id || null,
          className: character?.classChoice ? String(character.displayName || "") : "",
          modelAssetId,
          level: Math.max(1, Math.floor(num(row.level, 1))),
          leader: row.player_id === party.leader_player_id,
          online: this.online(row.player_id),
          hp: Math.round(hp.cur), hpMax: Math.round(hp.max),
          mp: Math.round(mp.cur), mpMax: Math.round(mp.max)
        };
      })
    };
  }

  viewFor(playerId) {
    return this.view(this.partyIdFor(playerId));
  }

  // Stuurt de groep naar de leden die online zijn, alleen als er iets veranderde (of force).
  push(partyId, force = false) {
    const view = this.view(partyId);
    if (!view) {
      this.sent.delete(partyId);
      return null;
    }
    const signature = JSON.stringify(view);
    if (!force && this.sent.get(partyId) === signature) return view;
    this.sent.set(partyId, signature);
    for (const member of view.members) if (member.online) this.send(member.id, { type: "party:state", party: view });
    this.perf.pushes += 1;
    return view;
  }

  tick(worldId, nowMs = Date.now()) {
    if (this.lastTickAtMs && nowMs - this.lastTickAtMs < TICK_MS) return;
    this.lastTickAtMs = nowMs;
    this.perf.ticks += 1;
    if (nowMs - this.cacheAt > CACHE_MS) {
      this.partyOf.clear();
      this.cacheAt = nowMs;
    }
    const parties = new Set();
    for (const state of this.host.playerStates(worldId) || []) {
      const playerId = state?.player_id;
      if (!playerId || !this.online(playerId, worldId)) continue;
      const partyId = this.partyIdFor(playerId);
      if (partyId) parties.add(partyId);
    }
    for (const partyId of parties) this.push(partyId, false);
    for (const partyId of Array.from(this.sent.keys())) if (!parties.has(partyId)) this.sent.delete(partyId);
  }

  // Na een groepsactie: de cache weg en (na de transactie) de nieuwe stand naar de groep en naar wie wegging.
  changed(partyId, playerIds = []) {
    const players = Array.from(new Set((playerIds || []).filter(Boolean)));
    for (const id of players) this.partyOf.delete(id);
    if (partyId) this.sent.delete(partyId);
    this.later(() => {
      for (const id of players) this.partyOf.delete(id);
      const view = partyId ? this.push(partyId, true) : null;
      const inView = new Set((view?.members || []).map((member) => member.id));
      for (const id of players) if (!inView.has(id)) this.send(id, { type: "party:state", party: this.viewFor(id) });
    });
  }

  inviteView(row, nowMs = Date.now()) {
    return {
      inviteId: row.id,
      fromId: row.inviter_player_id,
      fromName: row.inviter_name || "Speler",
      leftMs: Math.max(0, Date.parse(row.expires_at) - nowMs)
    };
  }

  // Een nieuwe uitnodiging: meteen naar de speler (alleen als hij na de transactie nog openstaat).
  inviteSent(inviteId) {
    this.later(() => {
      const row = this.host.db.prepare(`
        SELECT i.*, p.display_name AS inviter_name FROM party_invites i
        LEFT JOIN player_profiles p ON p.id = i.inviter_player_id WHERE i.id = ? LIMIT 1
      `).get(inviteId);
      if (!row || row.status !== "pending" || Date.parse(row.expires_at) <= Date.now()) return;
      this.send(row.invitee_player_id, { type: "party:invite", invite: this.inviteView(row) });
    });
  }

  // Een korte melding (toast) voor één of meer spelers.
  notice(playerIds, text) {
    const list = Array.isArray(playerIds) ? playerIds : [playerIds];
    this.later(() => {
      for (const id of list) if (id) this.send(id, { type: "party:notice", text: String(text || "") });
    });
  }

  // Bij (her)verbinden: je groep en je openstaande uitnodigingen.
  sendTo(playerId) {
    if (!playerId) return;
    this.partyOf.delete(playerId);
    this.send(playerId, { type: "party:state", party: this.viewFor(playerId) });
    const nowMs = Date.now();
    const rows = this.host.db.prepare(`
      SELECT i.*, p.display_name AS inviter_name FROM party_invites i
      LEFT JOIN player_profiles p ON p.id = i.inviter_player_id
      WHERE i.invitee_player_id = ? AND i.status = 'pending' AND i.expires_at > ?
      ORDER BY i.created_at DESC LIMIT 3
    `).all(playerId, new Date(nowMs).toISOString());
    for (const row of rows) this.send(playerId, { type: "party:invite", invite: this.inviteView(row, nowMs) });
  }

  snapshotForDebug() {
    return Object.assign({ parties: this.sent.size }, this.perf);
  }
}
