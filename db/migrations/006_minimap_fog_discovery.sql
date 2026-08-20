CREATE TABLE IF NOT EXISTS player_fog_discovery_cells (
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  map_layer TEXT NOT NULL DEFAULT 'overworld',
  cell_key TEXT NOT NULL,
  discovery_type TEXT NOT NULL DEFAULT 'movement',
  source_area_id TEXT,
  discovered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, world_id, map_layer, cell_key),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_fog_discovery_player_world
  ON player_fog_discovery_cells(player_id, world_id, map_layer);

CREATE INDEX IF NOT EXISTS idx_player_fog_discovery_area
  ON player_fog_discovery_cells(world_id, map_layer, source_area_id)
  WHERE source_area_id IS NOT NULL;
