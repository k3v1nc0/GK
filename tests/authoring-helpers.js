// Fase 03: gedeelde testhulp (in-memory DB met alleen de authoringmigraties).
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function authoringDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("db/migrations/012_authoring_core.sql", "utf8"));
  db.exec(fs.readFileSync("db/migrations/013_builds.sql", "utf8"));
  // Stand-in voor de nodegraph: telling en inhoud mogen door authoring nooit veranderen.
  db.exec("CREATE TABLE editor_nodes (id TEXT PRIMARY KEY, values_json TEXT); CREATE TABLE editor_node_edges (id TEXT PRIMARY KEY);");
  db.exec("INSERT INTO editor_nodes VALUES ('n1', '{}'); INSERT INTO editor_node_edges VALUES ('e1');");
  return db;
}

export function graphHash(db) {
  return JSON.stringify([db.prepare("SELECT * FROM editor_nodes ORDER BY id").all(), db.prepare("SELECT * FROM editor_node_edges ORDER BY id").all()]);
}
