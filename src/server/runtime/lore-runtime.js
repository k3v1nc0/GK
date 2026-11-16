// Werkbank Fase 10 (10b): het 📚 kennisboek. Een speler leest een 📕 Verhaal op een model (grafsteen, boek, bord).
// De server kijkt of hij er echt bij staat (en of het model er voor hem is) en bewaart het per account.
// De tekst zelf staat in de wereld (world.lore); de game toont hem, ook later opnieuw in het kennisboek.
export const LORE_READ_RANGE_M = 4;

export function readablesOf(world) {
  return Array.isArray(world?.readables) ? world.readables.filter((entry) => entry && entry.id && entry.loreId) : [];
}

function refused(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// contextFor(req) -> { profile, position, world } (zoals node03 getRequestContext); flags = mmoService.worldFlags.
export class LoreRuntime {
  constructor({ db, contextFor, flags = () => null }) {
    this.db = db;
    this.contextFor = contextFor;
    this.flags = flags;
  }

  reads(playerId) {
    return this.db.prepare("SELECT lore_id, read_at FROM player_lore_reads WHERE player_id = ? ORDER BY read_at, lore_id").all(playerId)
      .map((row) => ({ loreId: row.lore_id, readAt: row.read_at }));
  }

  stateForRequest(req) {
    const ctx = this.contextFor(req);
    return { ok: true, reads: this.reads(ctx.profile.id) };
  }

  readForRequest(req, body = {}) {
    const ctx = this.contextFor(req);
    const playerId = ctx.profile.id;
    const readable = readablesOf(ctx.world).find((entry) => entry.id === String(body?.readableId || ""));
    const flags = this.flags();
    if (!readable || (readable.flag && flags && !flags.passes(playerId, readable.flag))) throw refused(404, "Hier valt niets te lezen.");
    if (!ctx.world?.lore?.[readable.loreId]) throw refused(404, "Dit verhaal bestaat niet meer. Vraag de maker om SAVE TO GAME.");
    const distance = Math.hypot((Number(ctx.position?.x) || 0) - readable.x, (Number(ctx.position?.z) || 0) - readable.z);
    if (!(distance <= LORE_READ_RANGE_M + (Number(readable.reach) || 0))) throw refused(409, "Loop dichterbij om te lezen.");
    const result = this.db.prepare("INSERT OR IGNORE INTO player_lore_reads (player_id, lore_id, read_at) VALUES (?, ?, ?)")
      .run(playerId, readable.loreId, new Date().toISOString());
    return { ok: true, loreId: readable.loreId, first: result.changes > 0, reads: this.reads(playerId) };
  }
}
