-- Fase 4 auth and account database foundation.
-- Schema only: no production data, no passwords, no hashes, no tokens, no secrets.

CREATE TABLE IF NOT EXISTS editor_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(320) NOT NULL,
  normalized_email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_hash_algorithm VARCHAR(64) NOT NULL,
  is_email_verified TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at TIMESTAMP(6) NULL,
  password_changed_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_users_normalized_email (normalized_email),
  CONSTRAINT chk_editor_users_normalized_email CHECK (normalized_email = LOWER(TRIM(email)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_roles_slug (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_user_roles (
  editor_user_id BIGINT UNSIGNED NOT NULL,
  editor_role_id BIGINT UNSIGNED NOT NULL,
  assigned_by_editor_user_id BIGINT UNSIGNED NULL,
  assigned_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (editor_user_id, editor_role_id),
  KEY idx_editor_user_roles_role (editor_role_id),
  KEY idx_editor_user_roles_assigned_by (assigned_by_editor_user_id),
  CONSTRAINT fk_editor_user_roles_user FOREIGN KEY (editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT fk_editor_user_roles_role FOREIGN KEY (editor_role_id) REFERENCES editor_roles (id),
  CONSTRAINT fk_editor_user_roles_assigned_by FOREIGN KEY (assigned_by_editor_user_id) REFERENCES editor_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(320) NOT NULL,
  normalized_email VARCHAR(320) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  password_hash_algorithm VARCHAR(64) NOT NULL,
  status ENUM('pending_verification', 'active', 'suspended', 'banned', 'deleted') NOT NULL DEFAULT 'pending_verification',
  email_verified_at TIMESTAMP(6) NULL,
  last_login_at TIMESTAMP(6) NULL,
  password_changed_at TIMESTAMP(6) NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_game_users_normalized_email (normalized_email),
  KEY idx_game_users_status (status),
  CONSTRAINT chk_game_users_normalized_email CHECK (normalized_email = LOWER(TRIM(email)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_user_status (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_user_id BIGINT UNSIGNED NOT NULL,
  status ENUM('pending_verification', 'active', 'suspended', 'banned', 'deleted') NOT NULL,
  changed_by_editor_user_id BIGINT UNSIGNED NULL,
  reason_code VARCHAR(64) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_game_user_status_user_created (game_user_id, created_at),
  KEY idx_game_user_status_editor (changed_by_editor_user_id),
  CONSTRAINT fk_game_user_status_user FOREIGN KEY (game_user_id) REFERENCES game_users (id),
  CONSTRAINT fk_game_user_status_editor FOREIGN KEY (changed_by_editor_user_id) REFERENCES editor_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope ENUM('editor', 'game') NOT NULL,
  editor_user_id BIGINT UNSIGNED NULL,
  game_user_id BIGINT UNSIGNED NULL,
  session_token_hash CHAR(64) NOT NULL,
  user_agent_hash CHAR(64) NULL,
  ip_hash CHAR(64) NULL,
  rotated_from_session_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at TIMESTAMP(6) NOT NULL,
  revoked_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_token_hash (session_token_hash),
  KEY idx_sessions_editor_user (editor_user_id),
  KEY idx_sessions_game_user (game_user_id),
  KEY idx_sessions_expires_revoked (expires_at, revoked_at),
  KEY idx_sessions_rotated_from (rotated_from_session_id),
  CONSTRAINT fk_sessions_editor_user FOREIGN KEY (editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT fk_sessions_game_user FOREIGN KEY (game_user_id) REFERENCES game_users (id),
  CONSTRAINT fk_sessions_rotated_from FOREIGN KEY (rotated_from_session_id) REFERENCES sessions (id),
  CONSTRAINT chk_sessions_scope_owner CHECK (
    (scope = 'editor' AND editor_user_id IS NOT NULL AND game_user_id IS NULL)
    OR
    (scope = 'game' AND game_user_id IS NOT NULL AND editor_user_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_profiles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  game_user_id BIGINT UNSIGNED NOT NULL,
  profile_data_json JSON NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_player_profiles_game_user (game_user_id),
  CONSTRAINT fk_player_profiles_game_user FOREIGN KEY (game_user_id) REFERENCES game_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS characters (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  player_profile_id BIGINT UNSIGNED NOT NULL,
  character_slot SMALLINT UNSIGNED NOT NULL,
  character_state_json JSON NULL,
  is_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_characters_profile_slot (player_profile_id, character_slot),
  KEY idx_characters_profile (player_profile_id),
  CONSTRAINT fk_characters_player_profile FOREIGN KEY (player_profile_id) REFERENCES player_profiles (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope ENUM('editor', 'game') NOT NULL,
  editor_user_id BIGINT UNSIGNED NULL,
  game_user_id BIGINT UNSIGNED NULL,
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at TIMESTAMP(6) NOT NULL,
  consumed_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_email_verification_tokens_hash (token_hash),
  KEY idx_email_verification_editor_user (editor_user_id),
  KEY idx_email_verification_game_user (game_user_id),
  KEY idx_email_verification_expires_consumed (expires_at, consumed_at),
  CONSTRAINT fk_email_verification_editor_user FOREIGN KEY (editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT fk_email_verification_game_user FOREIGN KEY (game_user_id) REFERENCES game_users (id),
  CONSTRAINT chk_email_verification_scope_owner CHECK (
    (scope = 'editor' AND editor_user_id IS NOT NULL AND game_user_id IS NULL)
    OR
    (scope = 'game' AND game_user_id IS NOT NULL AND editor_user_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope ENUM('editor', 'game') NOT NULL,
  editor_user_id BIGINT UNSIGNED NULL,
  game_user_id BIGINT UNSIGNED NULL,
  token_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  expires_at TIMESTAMP(6) NOT NULL,
  consumed_at TIMESTAMP(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_password_reset_tokens_hash (token_hash),
  KEY idx_password_reset_editor_user (editor_user_id),
  KEY idx_password_reset_game_user (game_user_id),
  KEY idx_password_reset_expires_consumed (expires_at, consumed_at),
  CONSTRAINT fk_password_reset_editor_user FOREIGN KEY (editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT fk_password_reset_game_user FOREIGN KEY (game_user_id) REFERENCES game_users (id),
  CONSTRAINT chk_password_reset_scope_owner CHECK (
    (scope = 'editor' AND editor_user_id IS NOT NULL AND game_user_id IS NULL)
    OR
    (scope = 'game' AND game_user_id IS NOT NULL AND editor_user_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_scope ENUM('system', 'editor', 'game') NOT NULL,
  actor_editor_user_id BIGINT UNSIGNED NULL,
  actor_game_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(96) NOT NULL,
  target_scope ENUM('system', 'editor', 'game', 'session', 'token') NOT NULL,
  target_id VARCHAR(96) NULL,
  request_id VARCHAR(96) NULL,
  ip_hash CHAR(64) NULL,
  metadata_json JSON NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_audit_log_action_created (action, created_at),
  KEY idx_audit_log_target (target_scope, target_id),
  KEY idx_audit_log_actor_editor (actor_editor_user_id),
  KEY idx_audit_log_actor_game (actor_game_user_id),
  CONSTRAINT fk_audit_log_actor_editor FOREIGN KEY (actor_editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT fk_audit_log_actor_game FOREIGN KEY (actor_game_user_id) REFERENCES game_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
