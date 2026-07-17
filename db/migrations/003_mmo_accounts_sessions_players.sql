PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS users_new (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'player')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO users_new (id, username, email, password_hash, password_salt, role, created_at, updated_at)
SELECT id, username, NULL, password_hash, password_salt, role, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

ALTER TABLE sessions ADD COLUMN session_token_hash TEXT;
ALTER TABLE sessions ADD COLUMN device_label TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(session_token_hash) WHERE session_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS player_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  selected_character_id TEXT,
  current_world_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_positions (
  player_id TEXT NOT NULL,
  world_id TEXT NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  z REAL NOT NULL,
  rotation_y REAL NOT NULL,
  revision INTEGER NOT NULL,
  last_update_source_session_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, world_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_connection_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  player_id TEXT,
  session_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_profiles_user_id ON player_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_player_positions_world_id ON player_positions(world_id);
CREATE INDEX IF NOT EXISTS idx_player_events_user_id ON player_connection_events(user_id);
CREATE INDEX IF NOT EXISTS idx_player_events_session_id ON player_connection_events(session_id);

PRAGMA foreign_keys = ON;
