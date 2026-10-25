-- Fase 02 (F2-E1-T02): player-character 1-op-1 en session lease.
-- player_profiles is nu account en character tegelijk. Deze tabel geeft elk profiel precies een
-- standaardcharacter, met de legacy profiel-ID als mapping. player_*-tabellen blijven op player_id;
-- selected_character_id behoudt zijn huidige betekenis (OB-06: cutover pas in F5/F6).
CREATE TABLE IF NOT EXISTS player_characters (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL UNIQUE,
  legacy_profile_id TEXT NOT NULL UNIQUE,
  character_definition_id TEXT,
  lease_epoch INTEGER NOT NULL DEFAULT 0,
  lease_session_id TEXT,
  lease_acquired_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (profile_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

-- Backfill: deterministische ID, dus idempotent (INSERT OR IGNORE).
INSERT OR IGNORE INTO player_characters (id, profile_id, legacy_profile_id, character_definition_id, lease_epoch, created_at, updated_at)
SELECT 'char_' || id, id, id, selected_character_id, 0, created_at, updated_at
FROM player_profiles;
