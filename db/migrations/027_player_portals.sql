-- Portals (8-11): welke portals een speler heeft vrijgespeeld (door er dichtbij te lopen).
-- Een portal met "Meteen vrij" staat hier niet in: die is voor iedereen al vrij.
CREATE TABLE IF NOT EXISTS player_portals (
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  portal_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (player_id, world_id, portal_id)
);
