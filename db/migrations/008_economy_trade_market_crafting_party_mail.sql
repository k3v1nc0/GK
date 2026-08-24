CREATE TABLE IF NOT EXISTS player_crafting_jobs (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  player_id TEXT NOT NULL,
  recipe_id TEXT NOT NULL,
  station_entity_id TEXT,
  zone_id TEXT,
  batch_count INTEGER NOT NULL CHECK (batch_count > 0),
  state TEXT NOT NULL CHECK (state IN ('running', 'completed', 'cancelled', 'failed')),
  input_snapshot_json TEXT NOT NULL,
  output_plan_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completes_at TEXT,
  completed_at TEXT,
  cancelled_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crafting_due
  ON player_crafting_jobs(state, completes_at);

CREATE TABLE IF NOT EXISTS vendor_stock_state (
  vendor_id TEXT NOT NULL,
  offer_id TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  quantity INTEGER,
  next_restock_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (vendor_id, offer_id, scope_key)
);

CREATE TABLE IF NOT EXISTS vendor_buyback (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('stack', 'instance')),
  item_id TEXT NOT NULL,
  item_payload_json TEXT NOT NULL DEFAULT '{}',
  quantity INTEGER NOT NULL DEFAULT 1,
  price_currency_id TEXT NOT NULL,
  price_amount_minor INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  claimed_at TEXT,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  leader_player_id TEXT NOT NULL,
  loot_policy_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  disbanded_at TEXT,
  FOREIGN KEY (leader_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('leader', 'member')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  contribution_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (party_id, player_id),
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_party_member
  ON party_members(player_id)
  WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS party_invites (
  id TEXT PRIMARY KEY,
  party_id TEXT,
  inviter_player_id TEXT NOT NULL,
  invitee_player_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (inviter_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (invitee_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS party_loot_rolls (
  id TEXT PRIMARY KEY,
  party_id TEXT NOT NULL,
  loot_instance_id TEXT NOT NULL,
  policy_mode TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('open', 'resolved', 'cancelled', 'expired')),
  eligible_player_ids_json TEXT NOT NULL,
  responses_json TEXT NOT NULL DEFAULT '{}',
  winner_player_id TEXT,
  opened_at TEXT NOT NULL,
  resolves_at TEXT NOT NULL,
  resolved_at TEXT,
  operation_id TEXT,
  FOREIGN KEY (party_id) REFERENCES parties(id) ON DELETE CASCADE,
  FOREIGN KEY (loot_instance_id) REFERENCES loot_instances(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS direct_trade_sessions (
  id TEXT PRIMARY KEY,
  player_a_id TEXT NOT NULL,
  player_b_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'invited', 'open', 'locked', 'confirmed_a', 'confirmed_b',
    'committing', 'completed', 'cancelled', 'expired', 'failed'
  )),
  player_a_confirmed INTEGER NOT NULL DEFAULT 0,
  player_b_confirmed INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT,
  operation_id TEXT,
  FOREIGN KEY (player_a_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (player_b_id) REFERENCES player_profiles(id) ON DELETE CASCADE,
  CHECK (player_a_id <> player_b_id)
);

CREATE INDEX IF NOT EXISTS idx_trade_active_players
  ON direct_trade_sessions(state, player_a_id, player_b_id);

CREATE TABLE IF NOT EXISTS direct_trade_offers (
  trade_session_id TEXT NOT NULL,
  owner_player_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (trade_session_id, owner_player_id, asset_kind, asset_id),
  FOREIGN KEY (trade_session_id) REFERENCES direct_trade_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS asset_reservations (
  id TEXT PRIMARY KEY,
  owner_player_id TEXT NOT NULL,
  reservation_kind TEXT NOT NULL CHECK (reservation_kind IN ('trade', 'market', 'crafting', 'mail')),
  reservation_ref TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'consumed', 'released', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT,
  released_at TEXT,
  UNIQUE (reservation_kind, reservation_ref, asset_kind, asset_id, owner_player_id),
  FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reservations_owner_active
  ON asset_reservations(owner_player_id, status, asset_kind, asset_id);

CREATE TABLE IF NOT EXISTS market_orders (
  id TEXT PRIMARY KEY,
  seller_player_id TEXT NOT NULL,
  item_kind TEXT NOT NULL CHECK (item_kind IN ('item_stack', 'item_instance')),
  item_id TEXT NOT NULL,
  item_instance_id TEXT,
  quantity_total INTEGER NOT NULL CHECK (quantity_total > 0),
  quantity_remaining INTEGER NOT NULL CHECK (quantity_remaining >= 0),
  currency_id TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor > 0),
  status TEXT NOT NULL CHECK (status IN ('active', 'partially_filled', 'filled', 'cancelled', 'expired', 'failed')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (seller_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_market_browse
  ON market_orders(status, item_id, currency_id, unit_price_minor, created_at, id);
CREATE INDEX IF NOT EXISTS idx_market_seller
  ON market_orders(seller_player_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_market_expiry
  ON market_orders(status, expires_at);

CREATE TABLE IF NOT EXISTS market_trades (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL,
  buyer_player_id TEXT NOT NULL,
  seller_player_id TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency_id TEXT NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  gross_amount_minor INTEGER NOT NULL,
  tax_amount_minor INTEGER NOT NULL,
  seller_amount_minor INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (order_id) REFERENCES market_orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (buyer_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT,
  FOREIGN KEY (seller_player_id) REFERENCES player_profiles(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_market_trade_order
  ON market_trades(order_id, created_at);

CREATE TABLE IF NOT EXISTS player_mail (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mail_type TEXT NOT NULL CHECK (mail_type IN ('system_delivery', 'market_sale', 'market_return', 'crafting_output', 'recovery')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('unread', 'read', 'partially_claimed', 'claimed', 'expired')),
  source_ref TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  read_at TEXT,
  claimed_at TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_player_mail_state
  ON player_mail(player_id, state, created_at);

CREATE TABLE IF NOT EXISTS player_mail_attachments (
  id TEXT PRIMARY KEY,
  mail_id TEXT NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('item_stack', 'item_instance', 'currency')),
  asset_id TEXT NOT NULL,
  quantity_minor INTEGER NOT NULL CHECK (quantity_minor > 0),
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL CHECK (state IN ('available', 'claimed', 'expired')),
  claimed_operation_id TEXT,
  claimed_at TEXT,
  FOREIGN KEY (mail_id) REFERENCES player_mail(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS economy_reconciliation_runs (
  id TEXT PRIMARY KEY,
  run_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  findings_json TEXT NOT NULL DEFAULT '[]',
  repairs_json TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  actor_user_id TEXT
);
