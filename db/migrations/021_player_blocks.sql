-- MMO stap 2 (3-11): blokkeren. Wie je blokkeert, kan je geen berichten of groepsuitnodigingen meer sturen,
-- en je ziet zijn berichten niet meer. Blijft bewaard tot je deblokkeert.
CREATE TABLE IF NOT EXISTS player_blocks (
  player_id TEXT NOT NULL,
  blocked_player_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (player_id, blocked_player_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_blocks_blocked ON player_blocks (blocked_player_id);
