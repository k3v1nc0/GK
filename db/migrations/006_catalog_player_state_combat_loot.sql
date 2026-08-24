CREATE TABLE IF NOT EXISTS player_progression (
  player_id TEXT PRIMARY KEY,
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  skill_points INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_stats (
  player_id TEXT NOT NULL,
  stat_id TEXT NOT NULL,
  base_value REAL NOT NULL,
  earned_value REAL NOT NULL DEFAULT 0,
  current_value REAL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, stat_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_inventory_stacks (
  stack_id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bind_state TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (player_id, item_id, bind_state),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inventory_player
  ON player_inventory_stacks(player_id, item_id);

CREATE TABLE IF NOT EXISTS player_item_instances (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bind_state TEXT NOT NULL,
  quality TEXT,
  durability REAL,
  max_durability REAL,
  modifiers_json TEXT NOT NULL DEFAULT '[]',
  location_type TEXT NOT NULL CHECK (location_type IN ('inventory', 'equipment', 'escrow', 'mail', 'deleted')),
  location_ref TEXT,
  locked_by_operation_id TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_instances_owner
  ON player_item_instances(player_id, location_type);

CREATE TABLE IF NOT EXISTS player_equipment (
  player_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  item_instance_id TEXT NOT NULL,
  equipped_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, slot_id),
  UNIQUE (item_instance_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (item_instance_id) REFERENCES player_item_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_currencies (
  player_id TEXT NOT NULL,
  currency_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, currency_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_abilities (
  player_id TEXT NOT NULL,
  ability_id TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 1,
  unlock_source TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (player_id, ability_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS player_ability_loadouts (
  player_id TEXT NOT NULL,
  loadout_id TEXT NOT NULL,
  slot_index INTEGER NOT NULL,
  ability_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, loadout_id, slot_index),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS operation_idempotency (
  operation_id TEXT PRIMARY KEY,
  player_id TEXT,
  operation_type TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  result_json TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_operation_player
  ON operation_idempotency(player_id, created_at);

CREATE TABLE IF NOT EXISTS economy_ledger (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL,
  player_id TEXT,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency', 'xp', 'ability', 'stat')),
  asset_id TEXT NOT NULL,
  delta_real REAL NOT NULL,
  before_real REAL,
  after_real REAL,
  reason TEXT NOT NULL,
  source_ref TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_economy_ledger_player
  ON economy_ledger(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_economy_ledger_operation
  ON economy_ledger(operation_id);

CREATE TABLE IF NOT EXISTS gameplay_events (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT UNIQUE,
  world_id TEXT NOT NULL,
  zone_id TEXT,
  player_id TEXT,
  event_type TEXT NOT NULL,
  source_id TEXT,
  target_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gameplay_events_player
  ON gameplay_events(player_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_gameplay_events_type
  ON gameplay_events(event_type, occurred_at);

CREATE TABLE IF NOT EXISTS world_entity_state (
  world_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  state_kind TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  expires_at TEXT,
  PRIMARY KEY (world_id, zone_id, instance_id)
);

CREATE TABLE IF NOT EXISTS player_resource_state (
  player_id TEXT NOT NULL,
  resource_instance_id TEXT NOT NULL,
  depleted_until TEXT,
  gather_count INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, resource_instance_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS loot_instances (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  source_instance_id TEXT,
  owner_player_id TEXT,
  ownership_mode TEXT NOT NULL,
  loot_kind TEXT NOT NULL CHECK (loot_kind IN ('item_stack', 'item_instance', 'currency')),
  definition_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('available', 'claimed', 'expired', 'cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_operation_id TEXT,
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_loot_owner_status
  ON loot_instances(owner_player_id, status, expires_at);

CREATE TABLE IF NOT EXISTS pickup_claims (
  pickup_instance_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (pickup_instance_id, player_id),
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);
