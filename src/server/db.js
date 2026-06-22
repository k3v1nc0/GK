import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const now = function () {
  return new Date().toISOString();
};

export function resolveDatabasePath(rootDir) {
  const configured = process.env.DATABASE_PATH || "./storage/gk-real-node-editor.sqlite";
  return path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
}

export function openDatabase(rootDir) {
  const databasePath = resolveDatabasePath(rootDir);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  applyMigrations(db, rootDir);
  return db;
}

function applyMigrations(db, rootDir) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
  const migrationsDir = path.join(rootDir, "db/migrations");
  const files = fs.readdirSync(migrationsDir).filter(function (file) {
    return file.endsWith(".sql");
  }).sort();
  const hasMigration = db.prepare("SELECT id FROM migrations WHERE id = ? LIMIT 1");
  const insertMigration = db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)");
  for (const file of files) {
    if (hasMigration.get(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      insertMigration.run(file, now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
