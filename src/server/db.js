import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assertIsolatedStorage, resolveAssetsPath } from "./storage-policy.js";
import { createDatabaseBackup, verifyBackup } from "./backup-service.js";

const now = function () {
  return new Date().toISOString();
};

export function resolveDatabasePath(rootDir) {
  const configured = process.env.DATABASE_PATH || "./storage/gk-real-node-editor.sqlite";
  return path.isAbsolute(configured) ? configured : path.join(rootDir, configured);
}

export async function openDatabase(rootDir) {
  const databasePath = resolveDatabasePath(rootDir);
  if (process.env.GK_TEST_ISOLATED === "1") {
    assertIsolatedStorage({ rootDir, databasePath, assetsPath: resolveAssetsPath(rootDir) });
  } else if (process.env.NODE_TEST_CONTEXT) {
    const error = new Error("Database openen vanuit node:test vereist GK_TEST_ISOLATED=1.");
    error.code = "TEST_ISOLATION_REQUIRED";
    throw error;
  }
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  try {
    await applyMigrations(db, rootDir, databasePath);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function migrationChecksum(sql) {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

function migrationPrefix(file) {
  const match = String(file).match(/^(\d{3})_/);
  return match ? match[1] : "";
}

function validateMigrationFiles(files) {
  const byPrefix = new Map();
  for (const file of files) {
    const prefix = migrationPrefix(file);
    if (!prefix) {
      const error = new Error("Ongeldige migratienaam: " + file);
      error.code = "MIGRATION_NAME_INVALID";
      throw error;
    }
    if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
    byPrefix.get(prefix).push(file);
  }
  const allowedLegacy006 = new Set(["006_catalog_player_state_combat_loot.sql", "006_minimap_fog_discovery.sql"]);
  for (const [prefix, names] of byPrefix) {
    if (names.length < 2) continue;
    if (prefix === "006" && names.length === 2 && names.every((name) => allowedLegacy006.has(name))) continue;
    const error = new Error("Dubbele migratieprefix " + prefix + ": " + names.join(", "));
    error.code = "MIGRATION_PREFIX_DUPLICATE";
    throw error;
  }
}

function migrationBackupTarget(databasePath, file) {
  const baseDir = path.resolve(process.env.MIGRATION_BACKUP_DIR || path.join(path.dirname(databasePath), "migration-backups"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(4).toString("hex");
  return path.join(baseDir, stamp + "-before-" + file.replace(/\.sql$/i, "") + "-" + suffix);
}

function sqlForTransaction(file, sql) {
  const requestsForeignKeysOff = /^\s*--\s*gk:foreign-keys-off\s*$/im.test(sql);
  const historicalForeignKeysOff = file === "003_mmo_accounts_sessions_players.sql";
  const containsPragma = /PRAGMA\s+foreign_keys\s*=\s*(?:OFF|ON)\s*;/i.test(sql);
  if (containsPragma && !historicalForeignKeysOff && !requestsForeignKeysOff) {
    const error = new Error("Migratie wijzigt foreign_keys zonder expliciete gk-header: " + file);
    error.code = "MIGRATION_FK_HEADER_REQUIRED";
    throw error;
  }
  return {
    foreignKeysOff: requestsForeignKeysOff || historicalForeignKeysOff,
    sql: sql.replace(/PRAGMA\s+foreign_keys\s*=\s*(?:OFF|ON)\s*;/gi, "")
  };
}

export async function applyMigrations(db, rootDir, databasePath = resolveDatabasePath(rootDir), options = {}) {
  db.exec("CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);");
  const migrationsDir = path.join(rootDir, "db/migrations");
  const files = fs.readdirSync(migrationsDir).filter(function (file) {
    return file.endsWith(".sql");
  }).sort();
  validateMigrationFiles(files);
  const sqlByFile = new Map(files.map((file) => [file, fs.readFileSync(path.join(migrationsDir, file), "utf8")]));
  const hasMigration = db.prepare("SELECT id FROM migrations WHERE id = ? LIMIT 1");
  const appliedFiles = files.filter((file) => hasMigration.get(file));
  const pendingFiles = files.filter((file) => !hasMigration.get(file));
  const hasChecksumTable = Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migration_checksums'").get());
  const backupImpl = options.createBackup || createDatabaseBackup;
  const verifyImpl = options.verifyBackup || verifyBackup;

  if (!hasChecksumTable && (appliedFiles.length || pendingFiles.length)) {
    const targetDir = migrationBackupTarget(databasePath, "migration-checksum-baseline.sql");
    const backupResult = await backupImpl({
      sourceDb: db, sourceDatabasePath: databasePath, assetsPath: resolveAssetsPath(rootDir), targetDir, rootDir,
      sourceSha: process.env.RELEASE_SHA || process.env.GITHUB_SHA || "unknown"
    });
    verifyImpl(backupResult.targetDir);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS migration_checksums (
    id TEXT PRIMARY KEY,
    prefix TEXT NOT NULL,
    checksum TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY (id) REFERENCES migrations(id) ON DELETE CASCADE
  );`);
  const checksumRow = db.prepare("SELECT checksum FROM migration_checksums WHERE id = ? LIMIT 1");
  const insertChecksum = db.prepare("INSERT INTO migration_checksums (id, prefix, checksum, recorded_at) VALUES (?, ?, ?, ?)");
  for (const file of appliedFiles) {
    const checksum = migrationChecksum(sqlByFile.get(file));
    const recorded = checksumRow.get(file);
    if (recorded && recorded.checksum !== checksum) {
      const error = new Error("Checksum van toegepaste migratie is gewijzigd: " + file);
      error.code = "MIGRATION_CHECKSUM_MISMATCH";
      throw error;
    }
    if (!recorded) insertChecksum.run(file, migrationPrefix(file), checksum, now());
  }

  const insertMigration = db.prepare("INSERT INTO migrations (id, applied_at) VALUES (?, ?)");
  for (const file of files) {
    if (hasMigration.get(file)) continue;
    const sql = sqlByFile.get(file);
    const checksum = migrationChecksum(sql);
    const targetDir = migrationBackupTarget(databasePath, file);
    const backupResult = await backupImpl({
      sourceDb: db, sourceDatabasePath: databasePath, assetsPath: resolveAssetsPath(rootDir), targetDir, rootDir,
      sourceSha: process.env.RELEASE_SHA || process.env.GITHUB_SHA || "unknown"
    });
    verifyImpl(backupResult.targetDir);
    const prepared = sqlForTransaction(file, sql);
    if (prepared.foreignKeysOff) db.exec("PRAGMA foreign_keys = OFF;");
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(prepared.sql);
      const foreignKeyErrors = db.prepare("PRAGMA foreign_key_check").all();
      if (foreignKeyErrors.length) {
        const error = new Error("foreign_key_check faalde voor " + file);
        error.code = "MIGRATION_FOREIGN_KEY_FAILED";
        throw error;
      }
      insertMigration.run(file, now());
      insertChecksum.run(file, migrationPrefix(file), checksum, now());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      if (prepared.foreignKeysOff) db.exec("PRAGMA foreign_keys = ON;");
    }
  }
}
