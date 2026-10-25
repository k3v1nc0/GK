-- Fase 03 (F3-E1-T02): canonieke documenten naast de nodegraph.
-- Een document heeft een vaste doc_key, een revision (CAS via If-Match) en een JSON-body.
-- editor_nodes/editor_node_edges worden door deze tabellen nooit aangeraakt.
CREATE TABLE IF NOT EXISTS authoring_documents (
  doc_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  revision INTEGER NOT NULL,
  body_json TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  legacy_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_authoring_documents_kind ON authoring_documents(kind, archived);

-- Elke geslaagde command; request_id maakt retries idempotent.
CREATE TABLE IF NOT EXISTS authoring_operations (
  request_id TEXT PRIMARY KEY,
  doc_key TEXT NOT NULL,
  command TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  response_json TEXT NOT NULL,
  actor_user_id TEXT,
  created_at TEXT NOT NULL
);

-- Uitgaande refs per document; blokkeert archiveren van een document waar nog naar verwezen wordt.
CREATE TABLE IF NOT EXISTS authoring_refs (
  from_doc_key TEXT NOT NULL,
  to_doc_key TEXT NOT NULL,
  PRIMARY KEY (from_doc_key, to_doc_key)
);
CREATE INDEX IF NOT EXISTS idx_authoring_refs_to ON authoring_refs(to_doc_key);

-- Per domein: wie is de writer. Geen rij = 'legacy' (Nodes). 'canonical' = de canonieke werkbank.
-- graph_revision is de bevroren graphrevisie bij finalize; report_json bewaart het importbesluit.
CREATE TABLE IF NOT EXISTS authoring_cutover (
  domain TEXT PRIMARY KEY CHECK (domain IN ('project', 'items', 'pickups')),
  writer TEXT NOT NULL CHECK (writer IN ('legacy', 'canonical')),
  graph_revision INTEGER,
  decided_by TEXT,
  decided_at TEXT NOT NULL,
  report_json TEXT NOT NULL DEFAULT '{}'
);
