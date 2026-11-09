// Quest Builder stap 9: wereldstatus (vlaggen). Eén plek die zegt welke vlaggen voor een speler aan staan, en dus
// welke NPC's en modellen hij ziet, waar hij tegenaan botst en met wie hij kan praten. De quest-motor zet vlaggen;
// de beweging (mmo-service), de quest-motor en de winkels (node05) vragen het hier na. Geen rij = uit.
const SERVER = "*";

export class WorldFlags {
  constructor(db) {
    this.db = db;
    this.players = new Map(); // playerId -> Map(flagId -> bool)
    this.server = null; // Map(flagId -> bool)
    this.version = 0; // gaat omhoog bij elke wijziging (caches elders weten zo dat ze opnieuw moeten kijken)
  }

  serverFlags() {
    if (!this.server) {
      this.server = new Map(this.db.prepare("SELECT flag_id, is_on FROM world_flags WHERE owner_id = ?").all(SERVER).map((row) => [row.flag_id, row.is_on === 1]));
    }
    return this.server;
  }

  playerFlags(playerId) {
    const id = String(playerId || "");
    if (!this.players.has(id)) {
      if (this.players.size > 5000) this.players.clear();
      this.players.set(id, new Map(this.db.prepare("SELECT flag_id, is_on FROM world_flags WHERE owner_id = ?").all(id).map((row) => [row.flag_id, row.is_on === 1])));
    }
    return this.players.get(id);
  }

  // Een eigen rij (speler of groep) gaat voor die van de server.
  isOn(playerId, flagId) {
    const own = this.playerFlags(playerId);
    if (own.has(flagId)) return own.get(flagId) === true;
    return this.serverFlags().get(flagId) === true;
  }

  onFlags(playerId) {
    const out = new Set();
    for (const [flagId, on] of this.serverFlags()) if (on) out.add(flagId);
    for (const [flagId, on] of this.playerFlags(playerId)) if (on) out.add(flagId); else out.delete(flagId);
    return Array.from(out).sort();
  }

  // gate = { flagId, on } (of { id, on } op een botsing): staat het er voor deze speler?
  passes(playerId, gate) {
    const flagId = gate?.flagId || gate?.id;
    if (!flagId) return true;
    return this.isOn(playerId, flagId) === (gate.on !== false);
  }

  // De NPC's en modellen die deze speler niet ziet (entity-ID's).
  hiddenEntityIds(playerId, gates) {
    return (Array.isArray(gates) ? gates : []).filter((gate) => !this.passes(playerId, gate)).map((gate) => gate.entityId);
  }

  // ownerIds: spelers, of null = de hele server.
  write(ownerIds, flagId, on, { questId = null, setBy = null } = {}) {
    const owners = ownerIds === null ? [SERVER] : Array.from(new Set(ownerIds.filter(Boolean).map(String)));
    const stamp = new Date().toISOString();
    const statement = this.db.prepare(`
      INSERT INTO world_flags (owner_id, flag_id, is_on, quest_id, set_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_id, flag_id) DO UPDATE SET is_on = excluded.is_on, quest_id = excluded.quest_id, set_by = excluded.set_by, updated_at = excluded.updated_at
    `);
    for (const owner of owners) statement.run(owner, flagId, on ? 1 : 0, questId, setBy, stamp);
    this.forget(ownerIds === null ? null : owners);
    return owners;
  }

  // Na een wijziging (of een teruggedraaide transactie): opnieuw uit de database lezen.
  forget(ownerIds = null) {
    if (ownerIds === null) { this.server = null; this.players.clear(); }
    else for (const id of ownerIds) this.players.delete(String(id));
    this.version += 1;
  }
}
