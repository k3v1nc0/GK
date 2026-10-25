// F2-E1-T02: een character per profiel (1-op-1) en een session lease met epoch.
//
// - ensureCharacter(profile): maakt het standaardcharacter als het nog niet bestaat (zelfde regel als de
//   backfill in migratie 011: id = "char_" + profiel-ID).
// - acquireLease(profileId, sessionId): een nieuwe sessie neemt de lease over; de epoch gaat omhoog.
//   Wie een oudere epoch vasthoudt, is gefenced (isLeaseCurrent = false).
// - Dezelfde sessie opnieuw: zelfde epoch (een reconnect fencet zichzelf niet).
// Nog geen consumers die op character-ID schrijven; selected_character_id blijft ongewijzigd (OB-06).

function isoNow() {
  return new Date().toISOString();
}

export function characterIdForProfile(profileId) {
  return "char_" + String(profileId);
}

export class CharacterService {
  constructor(db) {
    this.db = db;
  }

  getByProfileId(profileId) {
    return this.db.prepare("SELECT * FROM player_characters WHERE profile_id = ? LIMIT 1").get(profileId) || null;
  }

  ensureCharacter(profile) {
    if (!profile?.id) return null;
    const existing = this.getByProfileId(profile.id);
    if (existing) return existing;
    const stamp = isoNow();
    this.db.prepare(`
      INSERT OR IGNORE INTO player_characters (id, profile_id, legacy_profile_id, character_definition_id, lease_epoch, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(characterIdForProfile(profile.id), profile.id, profile.id, profile.selected_character_id || null, stamp, stamp);
    return this.getByProfileId(profile.id);
  }

  acquireLease(profileId, sessionId) {
    const character = this.getByProfileId(profileId);
    if (!character) return null;
    if (character.lease_session_id && character.lease_session_id === sessionId) {
      return { characterId: character.id, epoch: Number(character.lease_epoch), takeover: false };
    }
    const stamp = isoNow();
    this.db.prepare(`
      UPDATE player_characters
      SET lease_epoch = lease_epoch + 1, lease_session_id = ?, lease_acquired_at = ?, updated_at = ?
      WHERE id = ?
    `).run(sessionId || null, stamp, stamp, character.id);
    const next = this.getByProfileId(profileId);
    return {
      characterId: next.id,
      epoch: Number(next.lease_epoch),
      takeover: Boolean(character.lease_session_id),
      previousSessionId: character.lease_session_id || null
    };
  }

  isLeaseCurrent(profileId, epoch) {
    const character = this.getByProfileId(profileId);
    return Boolean(character) && Number(character.lease_epoch) === Number(epoch);
  }

  assertLeaseCurrent(profileId, epoch) {
    if (this.isLeaseCurrent(profileId, epoch)) return true;
    const error = new Error("Dit character wordt nu door een andere sessie gespeeld.");
    error.status = 409;
    error.code = "CHARACTER_LEASE_FENCED";
    throw error;
  }
}
