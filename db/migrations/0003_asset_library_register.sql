CREATE TABLE IF NOT EXISTS asset_library_records (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  asset_key VARCHAR(191) NOT NULL,
  asset_type ENUM('glb', 'ui_image', 'audio') NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  relative_path VARCHAR(1024) NOT NULL,
  extension VARCHAR(32) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  modified_at DATETIME(3) NOT NULL,
  content_hash_algorithm VARCHAR(32) NULL,
  content_hash CHAR(64) NULL,
  metadata_json JSON NOT NULL,
  status ENUM('active', 'missing', 'invalid') NOT NULL DEFAULT 'active',
  role_mapping_status ENUM('unassigned', 'candidate', 'assigned') NOT NULL DEFAULT 'unassigned',
  role_mapping_json JSON NOT NULL,
  first_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY ux_asset_library_records_asset_key (asset_key),
  KEY ix_asset_library_records_asset_type (asset_type),
  KEY ix_asset_library_records_status (status),
  KEY ix_asset_library_records_role_mapping_status (role_mapping_status),
  CONSTRAINT ck_asset_library_records_hash_pair CHECK (
    (content_hash_algorithm IS NULL AND content_hash IS NULL)
    OR (content_hash_algorithm = 'sha256' AND content_hash REGEXP '^[0-9a-f]{64}$')
  )
);

CREATE TABLE IF NOT EXISTS asset_library_scan_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  source_dir VARCHAR(1024) NOT NULL,
  scanned_at DATETIME(3) NOT NULL,
  glb_count INT UNSIGNED NOT NULL DEFAULT 0,
  ui_image_count INT UNSIGNED NOT NULL DEFAULT 0,
  audio_count INT UNSIGNED NOT NULL DEFAULT 0,
  missing_count INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_count INT UNSIGNED NOT NULL DEFAULT 0,
  validation_issues_json JSON NOT NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  copies_assets_to_git TINYINT(1) NOT NULL DEFAULT 0,
  assigns_definitive_runtime_roles TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_asset_library_scan_runs_scanned_at (scanned_at),
  CONSTRAINT ck_asset_library_scan_runs_no_runtime_publish CHECK (publishes_runtime_output = 0),
  CONSTRAINT ck_asset_library_scan_runs_no_git_copy CHECK (copies_assets_to_git = 0),
  CONSTRAINT ck_asset_library_scan_runs_no_runtime_roles CHECK (assigns_definitive_runtime_roles = 0)
);
