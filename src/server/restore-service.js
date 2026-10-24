import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { verifyBackup } from "./backup-service.js";
import { isPathInside } from "./storage-policy.js";

function isEmptyDirectory(directory) {
  return fs.existsSync(directory) && fs.statSync(directory).isDirectory() && fs.readdirSync(directory).length === 0;
}

function comparableCounts(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND (name = 'users' OR name = 'editor_nodes' OR name LIKE 'player\_%' ESCAPE '\\')
    ORDER BY name
  `).all().map((row) => row.name);
  return Object.fromEntries(tables.map((table) => {
    const escaped = table.replace(/"/g, '""');
    return [table, Number(db.prepare('SELECT COUNT(*) AS total FROM "' + escaped + '"').get().total)];
  }));
}

function publishedHash(db) {
  const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'published_world_state'").get();
  if (!exists) return null;
  const columns = db.prepare("PRAGMA table_info(published_world_state)").all().map((row) => row.name);
  if (!columns.includes("content_hash")) return null;
  return db.prepare("SELECT content_hash FROM published_world_state WHERE id = 1").get()?.content_hash || null;
}

export function restoreDatabaseBackup(options) {
  const backupDir = path.resolve(options.backupDir);
  const targetDir = path.resolve(options.targetDir);
  const rootDir = path.resolve(options.rootDir);
  const publicRoot = path.join(rootDir, "apps", "web", "public");
  const servedAssets = path.join(rootDir, "assets");
  if (isPathInside(publicRoot, targetDir) || isPathInside(servedAssets, targetDir)) {
    const error = new Error("Restoredoel geweigerd: publieke map is niet toegestaan.");
    error.code = "PUBLIC_RESTORE_TARGET";
    throw error;
  }
  if (fs.existsSync(targetDir) && !isEmptyDirectory(targetDir)) {
    const error = new Error("Restoredoel moet een lege directory zijn.");
    error.code = "RESTORE_TARGET_NOT_EMPTY";
    throw error;
  }
  const verification = verifyBackup(backupDir);
  fs.mkdirSync(targetDir, { recursive: true });
  const restoredDatabasePath = path.join(targetDir, "database.sqlite");
  const restoredAssetsPath = path.join(targetDir, "assets");
  try {
    fs.copyFileSync(path.join(backupDir, "database.sqlite"), restoredDatabasePath, fs.constants.COPYFILE_EXCL);
    fs.cpSync(path.join(backupDir, "assets"), restoredAssetsPath, { recursive: true, errorOnExist: true });
    const sourceDb = new DatabaseSync(path.join(backupDir, "database.sqlite"), { readOnly: true });
    const restoredDb = new DatabaseSync(restoredDatabasePath, { readOnly: true });
    try {
      const integrity = restoredDb.prepare("PRAGMA integrity_check").get()?.integrity_check;
      const sourceCounts = comparableCounts(sourceDb);
      const restoredCounts = comparableCounts(restoredDb);
      const sourcePublishedHash = publishedHash(sourceDb);
      const restoredPublishedHash = publishedHash(restoredDb);
      if (integrity !== "ok" || JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts) || sourcePublishedHash !== restoredPublishedHash) {
        const error = new Error("Restorevergelijking faalde.");
        error.code = "RESTORE_VERIFICATION_FAILED";
        throw error;
      }
      return {
        ok: true,
        targetDir,
        databasePath: restoredDatabasePath,
        assetsPath: restoredAssetsPath,
        integrity,
        counts: restoredCounts,
        publishedHash: restoredPublishedHash,
        manifest: verification.manifest
      };
    } finally {
      sourceDb.close();
      restoredDb.close();
    }
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}
