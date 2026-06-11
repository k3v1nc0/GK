-- Fase 6 node graph core.
-- Schema only: no gamecontent, no assets, no secrets, no published runtime output.

CREATE TABLE IF NOT EXISTS editor_node_graphs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_key VARCHAR(96) NOT NULL,
  title VARCHAR(160) NULL,
  current_revision_id BIGINT UNSIGNED NULL,
  created_by_editor_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_node_graphs_key (graph_key),
  KEY idx_editor_node_graphs_created_by (created_by_editor_user_id),
  KEY idx_editor_node_graphs_current_revision (current_revision_id),
  CONSTRAINT fk_editor_node_graphs_created_by FOREIGN KEY (created_by_editor_user_id) REFERENCES editor_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_node_graph_nodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_id BIGINT UNSIGNED NOT NULL,
  node_key VARCHAR(96) NOT NULL,
  node_type VARCHAR(128) NOT NULL,
  position_x DECIMAL(12, 3) NOT NULL DEFAULT 0,
  position_y DECIMAL(12, 3) NOT NULL DEFAULT 0,
  fields_json JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_node_graph_nodes_key (graph_id, node_key),
  KEY idx_editor_node_graph_nodes_type (node_type),
  CONSTRAINT fk_editor_node_graph_nodes_graph FOREIGN KEY (graph_id) REFERENCES editor_node_graphs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_node_graph_edges (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_id BIGINT UNSIGNED NOT NULL,
  edge_key VARCHAR(96) NOT NULL,
  source_node_key VARCHAR(96) NOT NULL,
  source_socket_key VARCHAR(96) NOT NULL,
  target_node_key VARCHAR(96) NOT NULL,
  target_socket_key VARCHAR(96) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_node_graph_edges_key (graph_id, edge_key),
  KEY idx_editor_node_graph_edges_source (graph_id, source_node_key, source_socket_key),
  KEY idx_editor_node_graph_edges_target (graph_id, target_node_key, target_socket_key),
  CONSTRAINT fk_editor_node_graph_edges_graph FOREIGN KEY (graph_id) REFERENCES editor_node_graphs (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_node_graph_revisions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_id BIGINT UNSIGNED NOT NULL,
  revision_number BIGINT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  created_by_editor_user_id BIGINT UNSIGNED NULL,
  source_operation_id BIGINT UNSIGNED NULL,
  publishes_runtime_output TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_node_graph_revisions_number (graph_id, revision_number),
  KEY idx_editor_node_graph_revisions_created_by (created_by_editor_user_id),
  KEY idx_editor_node_graph_revisions_operation (source_operation_id),
  CONSTRAINT fk_editor_node_graph_revisions_graph FOREIGN KEY (graph_id) REFERENCES editor_node_graphs (id),
  CONSTRAINT fk_editor_node_graph_revisions_editor FOREIGN KEY (created_by_editor_user_id) REFERENCES editor_users (id),
  CONSTRAINT chk_editor_node_graph_revisions_draft_only CHECK (publishes_runtime_output = 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_node_graph_operation_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_id BIGINT UNSIGNED NOT NULL,
  editor_session_id BIGINT UNSIGNED NULL,
  editor_user_id BIGINT UNSIGNED NULL,
  operation_type VARCHAR(64) NOT NULL,
  operation_payload_json JSON NOT NULL,
  undoable TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_editor_node_graph_operation_graph_created (graph_id, created_at),
  KEY idx_editor_node_graph_operation_session (editor_session_id),
  KEY idx_editor_node_graph_operation_user (editor_user_id),
  CONSTRAINT fk_editor_node_graph_operation_graph FOREIGN KEY (graph_id) REFERENCES editor_node_graphs (id),
  CONSTRAINT fk_editor_node_graph_operation_session FOREIGN KEY (editor_session_id) REFERENCES sessions (id),
  CONSTRAINT fk_editor_node_graph_operation_user FOREIGN KEY (editor_user_id) REFERENCES editor_users (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS editor_node_graph_draft_state (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  graph_id BIGINT UNSIGNED NOT NULL,
  editor_session_id BIGINT UNSIGNED NOT NULL,
  draft_json JSON NOT NULL,
  undo_stack_json JSON NOT NULL,
  redo_stack_json JSON NOT NULL,
  history_depth SMALLINT UNSIGNED NOT NULL DEFAULT 100,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_editor_node_graph_draft_session (graph_id, editor_session_id),
  KEY idx_editor_node_graph_draft_session (editor_session_id),
  CONSTRAINT fk_editor_node_graph_draft_graph FOREIGN KEY (graph_id) REFERENCES editor_node_graphs (id),
  CONSTRAINT fk_editor_node_graph_draft_session FOREIGN KEY (editor_session_id) REFERENCES sessions (id),
  CONSTRAINT chk_editor_node_graph_draft_history_depth CHECK (history_depth = 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
