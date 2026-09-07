CREATE TABLE IF NOT EXISTS game_hud_layout_defaults (
  project_id TEXT NOT NULL,
  profile_id TEXT NOT NULL CHECK (profile_id IN ('default_desktop', 'default_mob')),
  layout_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (project_id, profile_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_game_hud_layout_defaults_project
  ON game_hud_layout_defaults(project_id, updated_at);
