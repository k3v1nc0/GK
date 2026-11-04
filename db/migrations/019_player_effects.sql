-- Healing (2-11): tijdelijke effecten van spelers (broodje = 5 min meer kracht, gif, genezing over tijd)
-- en de wachttijd per item. Tijden in echte milliseconden: 5 uur blijft 5 uur, ook als je offline bent.
CREATE TABLE IF NOT EXISTS player_effects (
  player_id TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_id TEXT NOT NULL,
  good INTEGER NOT NULL DEFAULT 1,
  effect_json TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  ends_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, effect_key)
);

CREATE INDEX IF NOT EXISTS idx_player_effects_ends ON player_effects (ends_at_ms);

CREATE TABLE IF NOT EXISTS player_item_cooldowns (
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  ready_at_ms INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_id)
);
