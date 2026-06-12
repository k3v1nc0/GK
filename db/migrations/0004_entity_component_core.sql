-- Fase 8 universal entity/component core.
-- Schema only: no gamecontent, no assets, no secrets, no published runtime output.

CREATE TABLE IF NOT EXISTS editor_entity_template_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_key VARCHAR(96) NOT NULL,
  source_graph_key VARCHAR(96) NULL,
  asset_key VARCHAR(191) NULL,
  role_mapping_status ENUM('candidate', 'assigned', 'invalid') NOT NULL DEFAULT 'candidate',
  draft_json JSON NOT NULL,
  validation_issues_json JSON NOT NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_by_editor_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_entity_template_drafts_key (entity_key),
  KEY idx_editor_entity_template_drafts_asset (asset_key),
  KEY idx_editor_entity_template_drafts_status (role_mapping_status),
  CONSTRAINT fk_editor_entity_template_drafts_editor FOREIGN KEY (created_by_editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT chk_editor_entity_template_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_entity_component_definition_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_template_draft_id BIGINT UNSIGNED NULL,
  component_key VARCHAR(96) NOT NULL,
  component_type ENUM('transform', 'renderable', 'collider', 'interactable', 'npc_brain', 'audio_emitter', 'combatant', 'boss', 'loot', 'quest_target', 'merchant', 'player_appearance', 'group_transform') NOT NULL,
  component_status ENUM('candidate', 'assigned', 'invalid') NOT NULL DEFAULT 'candidate',
  component_json JSON NOT NULL,
  validation_issues_json JSON NOT NULL,
  runtime_active TINYINT(1) NOT NULL DEFAULT 0,
  editor_data_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  animation_mapping_json JSON NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_entity_component_drafts_key (entity_template_draft_id, component_key),
  KEY idx_editor_entity_component_drafts_type (component_type),
  KEY idx_editor_entity_component_drafts_status (component_status),
  CONSTRAINT fk_editor_entity_component_drafts_entity FOREIGN KEY (entity_template_draft_id) REFERENCES editor_entity_template_drafts (id),
  CONSTRAINT chk_editor_entity_component_drafts_no_publish CHECK (publishes_runtime_output = 0),
  CONSTRAINT chk_editor_entity_component_drafts_runtime_gate CHECK (runtime_active = 0 OR editor_data_confirmed = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_entity_group_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_key VARCHAR(96) NOT NULL,
  group_json JSON NOT NULL,
  group_transform_json JSON NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_entity_group_drafts_key (group_key),
  CONSTRAINT chk_editor_entity_group_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_entity_component_validation_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  entity_template_draft_id BIGINT UNSIGNED NULL,
  component_definition_draft_id BIGINT UNSIGNED NULL,
  issue_path VARCHAR(255) NOT NULL,
  severity ENUM('warning', 'error') NOT NULL,
  blocks_runtime_activation TINYINT(1) NOT NULL DEFAULT 0,
  message VARCHAR(512) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_editor_entity_validation_entity (entity_template_draft_id),
  KEY idx_editor_entity_validation_component (component_definition_draft_id),
  KEY idx_editor_entity_validation_severity (severity),
  CONSTRAINT fk_editor_entity_validation_entity FOREIGN KEY (entity_template_draft_id) REFERENCES editor_entity_template_drafts (id),
  CONSTRAINT fk_editor_entity_validation_component FOREIGN KEY (component_definition_draft_id) REFERENCES editor_entity_component_definition_drafts (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_asset_entity_role_mapping_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_key VARCHAR(191) NOT NULL,
  mapping_status ENUM('candidate', 'assigned', 'invalid') NOT NULL DEFAULT 'candidate',
  candidate_components_json JSON NOT NULL,
  assigned_components_json JSON NOT NULL,
  editor_data_json JSON NOT NULL,
  assigns_definitive_runtime_role TINYINT(1) NOT NULL DEFAULT 0,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_asset_entity_role_mapping_asset (asset_key),
  KEY idx_editor_asset_entity_role_mapping_status (mapping_status),
  CONSTRAINT chk_editor_asset_entity_role_mapping_no_runtime_role CHECK (assigns_definitive_runtime_role = 0),
  CONSTRAINT chk_editor_asset_entity_role_mapping_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
