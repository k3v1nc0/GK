-- Fase 03 (F3-E2-T02/T03): immutable builds op schijf en een atomische releasepointer.
CREATE TABLE IF NOT EXISTS authoring_builds (
  build_id TEXT PRIMARY KEY,
  root_sha256 TEXT NOT NULL,
  compiler_version TEXT NOT NULL,
  files_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL
);

-- Precies een rij: de actieve build. revision is de If-Match voor rollback.
CREATE TABLE IF NOT EXISTS authoring_release (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_build_id TEXT,
  revision INTEGER NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO authoring_release (id, active_build_id, revision, updated_at)
VALUES (1, NULL, 0, '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS authoring_release_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  from_build_id TEXT,
  to_build_id TEXT,
  reason TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL
);
