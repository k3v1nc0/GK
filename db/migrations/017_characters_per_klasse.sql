-- gk:foreign-keys-off
-- Klassen (29-10): een account heeft per klasse een eigen character (eigen tas, level en plek).
-- Elk character is een rij in player_profiles; alle player_*-tabellen blijven op player_id = profiel-ID.
-- Daarom mag user_id niet meer uniek zijn. users.active_profile_id onthoudt met welk character je speelt.
-- model_asset_id is het gekozen uiterlijk (een model uit de lijst van de klasse).
CREATE TABLE player_profiles_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  selected_character_id TEXT,
  current_world_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  current_zone_id TEXT,
  model_asset_id TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO player_profiles_new (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at, current_zone_id)
SELECT id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at, current_zone_id FROM player_profiles;
DROP TABLE player_profiles;
ALTER TABLE player_profiles_new RENAME TO player_profiles;
CREATE INDEX idx_player_profiles_user_id ON player_profiles(user_id);
ALTER TABLE users ADD COLUMN active_profile_id TEXT;
UPDATE users SET active_profile_id = (SELECT id FROM player_profiles WHERE player_profiles.user_id = users.id ORDER BY created_at LIMIT 1);
