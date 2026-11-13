-- Werkbank Fase 9: beroepen. Per character per beroep de beroeps-XP (het niveau rekent de server uit de Beroep-kaart).
-- Een rij = dit character heeft het beroep geleerd (de eerste keer verzamelen of maken). Vergeten = rij weg.
CREATE TABLE IF NOT EXISTS player_professions (
  player_id TEXT NOT NULL,
  profession_id TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  learned_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, profession_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
