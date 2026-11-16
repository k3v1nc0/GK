-- Werkbank Fase 10: samen veilig spelen en het kennisboek. Alles per account (player_profiles), net als blokkeren.
-- Dempen: je ziet de chat van die speler niet meer (uitnodigen, ruilen en post kan nog; voor alles uit is er blokkeren).
CREATE TABLE IF NOT EXISTS player_mutes (
  player_id TEXT NOT NULL,
  muted_player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, muted_player_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (muted_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

-- Vriendenlijst: player_id vroeg het, friend_player_id moet het nog accepteren (pending) of deed dat al (accepted).
CREATE TABLE IF NOT EXISTS player_friends (
  player_id TEXT NOT NULL,
  friend_player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, friend_player_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_friends_friend ON player_friends (friend_player_id);

-- Een speler melden bij de maker. chat_json = de laatste chatberichten van die speler die de melder kreeg (de server
-- bewaart chat verder niet). De admin ziet de meldingen in de editor (Instellingen > Gebruikers) en zet ze op afgehandeld.
CREATE TABLE IF NOT EXISTS player_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_player_id TEXT NOT NULL,
  reported_player_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  chat_json TEXT NOT NULL DEFAULT '[]',
  world_id TEXT,
  x REAL,
  z REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at TEXT NOT NULL,
  handled_at TEXT,
  handled_by TEXT,
  FOREIGN KEY (reporter_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (reported_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_player_reports_status ON player_reports (status, created_at);

-- 📚 Kennisboek: welke verhalen (📕 Verhaal-kaarten) dit account al las.
CREATE TABLE IF NOT EXISTS player_lore_reads (
  player_id TEXT NOT NULL,
  lore_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY (player_id, lore_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
