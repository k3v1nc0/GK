-- Ombouw stap 2: vlakken en paden (Area tool) krijgen een eigen verhuisdomein 'areas'.
CREATE TABLE authoring_cutover_o2 (
  domain TEXT PRIMARY KEY CHECK (domain IN ('project', 'items', 'pickups', 'actors', 'areas')),
  writer TEXT NOT NULL CHECK (writer IN ('legacy', 'canonical')),
  graph_revision INTEGER,
  decided_by TEXT,
  decided_at TEXT NOT NULL,
  report_json TEXT NOT NULL DEFAULT '{}'
);
INSERT INTO authoring_cutover_o2 (domain, writer, graph_revision, decided_by, decided_at, report_json)
  SELECT domain, writer, graph_revision, decided_by, decided_at, report_json FROM authoring_cutover;
DROP TABLE authoring_cutover;
ALTER TABLE authoring_cutover_o2 RENAME TO authoring_cutover;
