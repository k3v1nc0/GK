-- Fase 8 herstel 2 (Kevin 12-11): het buitvenster. Wat een vijand laat vallen of een grondstof oplevert, ligt eerst klaar
-- voor de speler (hij kiest wat hij meeneemt). Pas bij Pakken gaat het in de tas, in dezelfde transactie als het wegstrepen
-- hier, dus nooit dubbel. Wat te lang blijft liggen, verdwijnt (state 'expired'). Staat "Automatisch buit pakken" aan,
-- dan komt hier niets en gaat alles meteen in de tas (zoals eerst).
CREATE TABLE IF NOT EXISTS player_pending_loot (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('enemy', 'resource')),
  source_ref TEXT NOT NULL,
  label TEXT,
  reason TEXT NOT NULL,
  entries_json TEXT NOT NULL DEFAULT '[]',
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'taken', 'expired')),
  operation_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_pending_loot_open ON player_pending_loot(player_id, state, expires_at);
