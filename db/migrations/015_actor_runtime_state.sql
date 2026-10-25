-- Fase 05 (F5-E2-T05): runtime-state van canonieke vijanden en grondstoffen, en loot-claims (exactly-once).
-- Levende vijanden staan alleen in het geheugen (levenspunten, positie). Alleen "dood/op tot <tijd>" en de
-- teller per plek staan hier, zodat een herstart geen vijand of grondstof te vroeg terugzet.

CREATE TABLE IF NOT EXISTS actor_spawn_state (
  world_id TEXT NOT NULL,
  spawn_key TEXT NOT NULL,              -- "actor:<spawnId>" of "res:<resourceSpawnId>"
  occurrence INTEGER NOT NULL DEFAULT 1 CHECK (occurrence >= 1),
  state TEXT NOT NULL CHECK (state IN ('alive', 'dead', 'depleted')),
  respawn_at_ms INTEGER,
  build_id TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (world_id, spawn_key)
);

-- Eén rij per beloning: persoonlijke loot = instance + character, gedeelde grondstof = instance.
-- De UNIQUE claim_key maakt dubbel uitbetalen onmogelijk, ook bij een herhaald of gelijktijdig verzoek.
CREATE TABLE IF NOT EXISTS actor_loot_claims (
  claim_key TEXT PRIMARY KEY,
  world_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  build_id TEXT,
  grants_json TEXT NOT NULL DEFAULT '[]',
  claimed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_actor_loot_claims_player ON actor_loot_claims(player_id, claimed_at);

-- Verhuizen van legacy-vijanden/grondstoffen krijgt een eigen domein 'actors'.
CREATE TABLE authoring_cutover_f5 (
  domain TEXT PRIMARY KEY CHECK (domain IN ('project', 'items', 'pickups', 'actors')),
  writer TEXT NOT NULL CHECK (writer IN ('legacy', 'canonical')),
  graph_revision INTEGER,
  decided_by TEXT,
  decided_at TEXT NOT NULL,
  report_json TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO authoring_cutover_f5 (domain, writer, graph_revision, decided_by, decided_at, report_json)
  SELECT domain, writer, graph_revision, decided_by, decided_at, report_json FROM authoring_cutover;
DROP TABLE authoring_cutover;
ALTER TABLE authoring_cutover_f5 RENAME TO authoring_cutover;
