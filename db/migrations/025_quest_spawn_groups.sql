-- Quest Builder stap 5 (5-11): vijanden die een quest laat verschijnen (Als → Dan), zodat ze een herstart overleven.
-- Eén rij per groep: voor wie (speler, groep of iedereen), wie hem nodig heeft (members) en de vijanden (actors: plek en of ze dood zijn).
CREATE TABLE IF NOT EXISTS quest_spawn_groups (
  world_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  spawn_id TEXT NOT NULL,
  step_id TEXT,
  rule_id TEXT,
  audience TEXT NOT NULL,
  owner_kind TEXT,
  owner_id TEXT,
  despawn TEXT NOT NULL,
  members_json TEXT NOT NULL DEFAULT '[]',
  actors_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (world_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_quest_spawn_groups_quest ON quest_spawn_groups (world_id, quest_id, spawn_id);
