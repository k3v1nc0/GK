-- Fase 8.1 procedural generation core.
-- Schema only: no gamecontent, no assets, no secrets, no published runtime output.

CREATE TABLE IF NOT EXISTS editor_procedural_graph_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_key VARCHAR(96) NOT NULL,
  seed_scope ENUM('world', 'zone', 'local') NULL,
  seed_value VARCHAR(191) NULL,
  graph_json JSON NOT NULL,
  validation_issues_json JSON NOT NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_by_editor_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_procedural_graph_drafts_key (graph_key),
  KEY idx_editor_procedural_graph_drafts_seed_scope (seed_scope),
  CONSTRAINT fk_editor_procedural_graph_drafts_editor FOREIGN KEY (created_by_editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT chk_editor_procedural_graph_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_procedural_generator_node_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  procedural_graph_draft_id BIGINT UNSIGNED NULL,
  node_key VARCHAR(96) NOT NULL,
  node_type ENUM(
    'proc.seed',
    'proc.random',
    'proc.pickWeighted',
    'proc.noise2D',
    'proc.noise3D',
    'proc.scatterAssets',
    'proc.scatterEntities',
    'proc.zoneLayout',
    'proc.pathNetwork',
    'proc.spawnArea',
    'proc.resourceDistribution',
    'proc.validateGeneratedGraph',
    'proc.previewGeneration',
    'proc.bakeGenerationDraft'
  ) NOT NULL,
  node_status ENUM('candidate', 'invalid') NOT NULL DEFAULT 'candidate',
  node_json JSON NOT NULL,
  uses_math_random TINYINT(1) NOT NULL DEFAULT 0,
  uses_implicit_time_source TINYINT(1) NOT NULL DEFAULT 0,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_procedural_generator_node_drafts_key (procedural_graph_draft_id, node_key),
  KEY idx_editor_procedural_generator_node_drafts_type (node_type),
  KEY idx_editor_procedural_generator_node_drafts_status (node_status),
  CONSTRAINT fk_editor_procedural_generator_node_drafts_graph FOREIGN KEY (procedural_graph_draft_id) REFERENCES editor_procedural_graph_drafts (id),
  CONSTRAINT chk_editor_procedural_generator_node_drafts_no_math_random CHECK (uses_math_random = 0),
  CONSTRAINT chk_editor_procedural_generator_node_drafts_no_time_source CHECK (uses_implicit_time_source = 0),
  CONSTRAINT chk_editor_procedural_generator_node_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_procedural_generation_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_key VARCHAR(96) NOT NULL,
  procedural_graph_draft_id BIGINT UNSIGNED NULL,
  generation_mode ENUM('preview', 'bake_draft') NOT NULL,
  deterministic_signature VARCHAR(512) NOT NULL,
  input_json JSON NOT NULL,
  output_json JSON NOT NULL,
  validation_issues_json JSON NOT NULL,
  writes_editor_draft_data TINYINT(1) NOT NULL DEFAULT 0,
  assets_copied_to_git TINYINT(1) NOT NULL DEFAULT 0,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_procedural_generation_runs_key (run_key),
  KEY idx_editor_procedural_generation_runs_graph (procedural_graph_draft_id),
  KEY idx_editor_procedural_generation_runs_mode (generation_mode),
  CONSTRAINT fk_editor_procedural_generation_runs_graph FOREIGN KEY (procedural_graph_draft_id) REFERENCES editor_procedural_graph_drafts (id),
  CONSTRAINT chk_editor_procedural_generation_runs_no_asset_copy CHECK (assets_copied_to_git = 0),
  CONSTRAINT chk_editor_procedural_generation_runs_no_publish CHECK (publishes_runtime_output = 0),
  CONSTRAINT chk_editor_procedural_generation_runs_bake_is_draft CHECK (generation_mode <> 'bake_draft' OR writes_editor_draft_data = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_generated_entity_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_run_id BIGINT UNSIGNED NULL,
  generated_key VARCHAR(96) NOT NULL,
  entity_draft_json JSON NOT NULL,
  candidate_status ENUM('candidate', 'invalid') NOT NULL DEFAULT 'candidate',
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_generated_entity_drafts_key (generation_run_id, generated_key),
  KEY idx_editor_generated_entity_drafts_status (candidate_status),
  CONSTRAINT fk_editor_generated_entity_drafts_run FOREIGN KEY (generation_run_id) REFERENCES editor_procedural_generation_runs (id),
  CONSTRAINT chk_editor_generated_entity_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_generated_group_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_run_id BIGINT UNSIGNED NULL,
  generated_key VARCHAR(96) NOT NULL,
  group_draft_json JSON NOT NULL,
  candidate_status ENUM('candidate', 'invalid') NOT NULL DEFAULT 'candidate',
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_generated_group_drafts_key (generation_run_id, generated_key),
  KEY idx_editor_generated_group_drafts_status (candidate_status),
  CONSTRAINT fk_editor_generated_group_drafts_run FOREIGN KEY (generation_run_id) REFERENCES editor_procedural_generation_runs (id),
  CONSTRAINT chk_editor_generated_group_drafts_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_generated_placement_candidates (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_run_id BIGINT UNSIGNED NULL,
  candidate_key VARCHAR(96) NOT NULL,
  asset_key VARCHAR(191) NULL,
  entity_key VARCHAR(96) NULL,
  placement_json JSON NOT NULL,
  candidate_status ENUM('candidate', 'invalid') NOT NULL DEFAULT 'candidate',
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_generated_placement_candidates_key (generation_run_id, candidate_key),
  KEY idx_editor_generated_placement_candidates_asset (asset_key),
  KEY idx_editor_generated_placement_candidates_entity (entity_key),
  KEY idx_editor_generated_placement_candidates_status (candidate_status),
  CONSTRAINT fk_editor_generated_placement_candidates_run FOREIGN KEY (generation_run_id) REFERENCES editor_procedural_generation_runs (id),
  CONSTRAINT chk_editor_generated_placement_candidates_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_generation_validation_issues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_run_id BIGINT UNSIGNED NULL,
  issue_path VARCHAR(255) NOT NULL,
  severity ENUM('warning', 'error') NOT NULL,
  blocks_bake TINYINT(1) NOT NULL DEFAULT 0,
  blocks_runtime_publish TINYINT(1) NOT NULL DEFAULT 0,
  message VARCHAR(512) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_editor_generation_validation_run (generation_run_id),
  KEY idx_editor_generation_validation_severity (severity),
  CONSTRAINT fk_editor_generation_validation_run FOREIGN KEY (generation_run_id) REFERENCES editor_procedural_generation_runs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_generation_bake_draft_results (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  generation_run_id BIGINT UNSIGNED NULL,
  result_key VARCHAR(96) NOT NULL,
  result_json JSON NOT NULL,
  writes_editor_draft_data TINYINT(1) NOT NULL DEFAULT 1,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_generation_bake_draft_results_key (generation_run_id, result_key),
  CONSTRAINT fk_editor_generation_bake_draft_results_run FOREIGN KEY (generation_run_id) REFERENCES editor_procedural_generation_runs (id),
  CONSTRAINT chk_editor_generation_bake_draft_results_draft_only CHECK (writes_editor_draft_data = 1),
  CONSTRAINT chk_editor_generation_bake_draft_results_no_publish CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
