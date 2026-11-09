-- Quest Builder stap 4 (5-11): pickups per speler (Ieder zijn eigen / Ieder 1×).
-- respawn_at NULL = komt voor deze speler nooit meer terug.
CREATE TABLE IF NOT EXISTS player_pickup_claims (
  player_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  respawn_at TEXT,
  PRIMARY KEY (player_id, instance_id)
);
