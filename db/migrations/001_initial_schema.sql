CREATE TABLE IF NOT EXISTS migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editor_nodes (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  parent_id TEXT,
  values_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES editor_nodes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS editor_node_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL,
  from_port TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  to_port TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (from_node_id) REFERENCES editor_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES editor_nodes(id) ON DELETE CASCADE,
  UNIQUE (from_node_id, from_port, to_node_id, to_port)
);

CREATE TABLE IF NOT EXISTS asset_library (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('model', 'texture', 'image', 'audio', 'data')),
  source_path TEXT NOT NULL,
  thumbnail_path TEXT,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_world_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  world_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS published_world_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  world_json TEXT NOT NULL,
  published_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publish_history (
  id TEXT PRIMARY KEY,
  world_json TEXT NOT NULL,
  actor_user_id TEXT,
  published_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nodes_parent ON editor_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_edges_to ON editor_node_edges(to_node_id, to_port);
CREATE INDEX IF NOT EXISTS idx_edges_from ON editor_node_edges(from_node_id, from_port);
