CREATE TABLE IF NOT EXISTS editor_graph_meta (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  graph_revision INTEGER NOT NULL DEFAULT 0,
  content_schema_version TEXT NOT NULL DEFAULT 'gk-node-content-v1',
  last_mutation_at TEXT NOT NULL
);

INSERT OR IGNORE INTO editor_graph_meta
  (id, graph_revision, content_schema_version, last_mutation_at)
VALUES
  (1, 0, 'gk-node-content-v1', CURRENT_TIMESTAMP);

ALTER TABLE editor_nodes ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS content_id_aliases (
  old_id TEXT PRIMARY KEY,
  new_id TEXT NOT NULL,
  symbol_kind TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  created_by_user_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_alias_new_id
  ON content_id_aliases(new_id);

CREATE TABLE IF NOT EXISTS graph_migration_runs (
  id TEXT PRIMARY KEY,
  migration_key TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('preview', 'applied', 'failed')),
  plan_json TEXT NOT NULL,
  result_json TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_graph_migration_key
  ON graph_migration_runs(migration_key, created_at);

ALTER TABLE draft_world_state ADD COLUMN build_id TEXT;
ALTER TABLE draft_world_state ADD COLUMN schema_version TEXT;
ALTER TABLE draft_world_state ADD COLUMN content_hash TEXT;

ALTER TABLE published_world_state ADD COLUMN build_id TEXT;
ALTER TABLE published_world_state ADD COLUMN schema_version TEXT;
ALTER TABLE published_world_state ADD COLUMN content_hash TEXT;

ALTER TABLE publish_history ADD COLUMN build_id TEXT;
ALTER TABLE publish_history ADD COLUMN schema_version TEXT;
ALTER TABLE publish_history ADD COLUMN content_hash TEXT;
