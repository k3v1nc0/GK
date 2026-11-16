-- Werkbank Fase 10 (keuze van Kevin 15-11): de Game Bible als tab in de editor.
-- Eén bord (kaarten, lijnen, kolommen, tags) als JSON. revision = optimistisch opslaan (wie later opslaat met een
-- oude revision krijgt een melding in plaats van andermans werk te overschrijven). De geschiedenis houdt de laatste versies.
CREATE TABLE IF NOT EXISTS game_bible (
  id TEXT PRIMARY KEY,
  board_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS game_bible_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  board_json TEXT NOT NULL,
  saved_at TEXT NOT NULL,
  saved_by TEXT
);
