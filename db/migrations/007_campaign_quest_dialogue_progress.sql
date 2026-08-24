CREATE TABLE IF NOT EXISTS player_quest_states (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available', 'active', 'ready_to_turn_in', 'completed', 'abandoned', 'failed')),
  active_step_id TEXT,
  tracked INTEGER NOT NULL DEFAULT 0,
  accepted_at TEXT,
  completed_at TEXT,
  claimed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  state_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, quest_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_quest_states_status
  ON player_quest_states(player_id, status, tracked);

CREATE TABLE IF NOT EXISTS player_objective_progress (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  objective_id TEXT NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  required_value INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'failed')),
  revision INTEGER NOT NULL DEFAULT 1,
  progress_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, quest_id, step_id, objective_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_quest_event_receipts (
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  consumed_at TEXT NOT NULL,
  PRIMARY KEY (player_id, quest_id, event_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_dialogue_choices (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  dialogue_id TEXT NOT NULL,
  entry_id TEXT,
  choice_id TEXT NOT NULL,
  quest_id TEXT,
  chosen_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_dialogue_choices_player
  ON player_dialogue_choices(player_id, dialogue_id, chosen_at);

CREATE TABLE IF NOT EXISTS player_flags (
  player_id TEXT NOT NULL,
  flag_id TEXT NOT NULL,
  value_json TEXT NOT NULL DEFAULT 'true',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, flag_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_reputation (
  player_id TEXT NOT NULL,
  reputation_id TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  rank_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, reputation_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_recipe_unlocks (
  player_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  unlock_source TEXT,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (player_id, recipe_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_discoveries (
  player_id TEXT NOT NULL,
  discovery_id TEXT NOT NULL,
  zone_id TEXT,
  discovered_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (player_id, discovery_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_fast_travel_unlocks (
  player_id TEXT NOT NULL,
  zone_link_id TEXT NOT NULL,
  unlock_source TEXT,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (player_id, zone_link_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_active_timers (
  player_id TEXT NOT NULL,
  timer_id TEXT NOT NULL,
  quest_id TEXT,
  expires_at TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, timer_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_transition_audit (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  quest_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  from_step_id TEXT,
  to_step_id TEXT,
  operation_id TEXT,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_quest_transition_audit_player
  ON quest_transition_audit(player_id, quest_id, created_at);
