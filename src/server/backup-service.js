import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { isPathInside } from "./storage-policy.js";

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function listFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const result = [];
  const visit = function (directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) result.push(filePath);
    }
  };
  visit(rootDir);
  return result.sort();
}

function tableExists(db, tableName) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1").get(tableName));
}

function currentMigrationHead(db) {
  if (!tableExists(db, "migrations")) return [];
  return db.prepare("SELECT id FROM migrations ORDER BY id").all().map((row) => row.id);
}

function currentPublishedBuild(db) {
  if (!tableExists(db, "published_world_state")) return null;
  const columns = db.prepare("PRAGMA table_info(published_world_state)").all().map((row) => row.name);
  const selections = ["id"];
  if (columns.includes("build_id")) selections.push("build_id");
  if (columns.includes("schema_version")) selections.push("schema_version");
  if (columns.includes("content_hash")) selections.push("content_hash");
  if (columns.includes("published_at")) selections.push("published_at");
  return db.prepare("SELECT " + selections.join(", ") + " FROM published_world_state WHERE id = 1").get() || null;
}

function assertBackupTarget(rootDir, assetsPath, targetDir) {
  const resolved = path.resolve(targetDir);
  const publicRoot = path.join(path.resolve(rootDir), "apps", "web", "public");
  const servedAssets = path.resolve(assetsPath);
  if (isPathInside(publicRoot, resolved) || isPathInside(servedAssets, resolved)) {
    const error = new Error("Backupdoel geweigerd: een publiek geserveerde map is niet toegestaan.");
    error.code = "PUBLIC_BACKUP_TARGET";
    throw error;
  }
  if (fs.existsSync(resolved)) {
    const error = new Error("Backupdoel geweigerd: doelmap bestaat al.");
    error.code = "BACKUP_TARGET_EXISTS";
    throw error;
  }
  return resolved;
}

export async function createDatabaseBackup(options) {
  const sourceDb = options?.sourceDb;
  if (!(sourceDb instanceof DatabaseSync)) throw new TypeError("Een geopende DatabaseSync-bron is verplicht.");
  const rootDir = path.resolve(options.rootDir);
  const sourceDatabasePath = path.resolve(options.sourceDatabasePath);
  const assetsPath = path.resolve(options.assetsPath);
  const targetDir = assertBackupTarget(rootDir, assetsPath, options.targetDir);
  const targetParent = path.dirname(targetDir);
  fs.mkdirSync(targetParent, { recursive: true });
  const stagingDir = fs.mkdtempSync(path.join(targetParent, ".gk-backup-staging-"));
  const databaseFile = path.join(stagingDir, "database.sqlite");
  const assetsTarget = path.join(stagingDir, "assets");
  const sourceHashBefore = sha256File(sourceDatabasePath);
  const backupImpl = options.backupImpl || backup;

  try {
    await backupImpl(sourceDb, databaseFile);
    const verificationDb = new DatabaseSync(databaseFile, { readOnly: true });
    const integrity = verificationDb.prepare("PRAGMA integrity_check").get();
    verificationDb.close();
    if (!integrity || integrity.integrity_check !== "ok") {
      const error = new Error("Backupintegriteit is niet ok.");
      error.code = "BACKUP_INTEGRITY_FAILED";
      throw error;
    }
    if (fs.existsSync(assetsPath)) fs.cpSync(assetsPath, assetsTarget, { recursive: true, errorOnExist: true });
    else fs.mkdirSync(assetsTarget, { recursive: true });
    const assets = listFiles(assetsTarget).map(function (filePath) {
      return {
        path: path.relative(assetsTarget, filePath).split(path.sep).join("/"),
        bytes: fs.statSync(filePath).size,
        sha256: sha256File(filePath)
      };
    });
    const manifest = {
      schemaVersion: "gk-backup-v1",
      createdAt: new Date().toISOString(),
      sourceSha: String(options.sourceSha || "unknown"),
      database: {
        file: "database.sqlite",
        sha256: sha256File(databaseFile),
        sourceSha256Before: sourceHashBefore,
        migrationHead: currentMigrationHead(sourceDb)
      },
      publishedBuild: currentPublishedBuild(sourceDb),
      assets
    };
    fs.writeFileSync(path.join(stagingDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    if (sha256File(sourceDatabasePath) !== sourceHashBefore) {
      const error = new Error("Bron-DB wijzigde tijdens de backupcontrole.");
      error.code = "BACKUP_SOURCE_CHANGED";
      throw error;
    }
    fs.renameSync(stagingDir, targetDir);
    return { targetDir, manifest };
  } catch (error) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
}

export function verifyBackup(backupDir) {
  const resolved = path.resolve(backupDir);
  const manifestPath = path.join(resolved, "manifest.json");
  const databasePath = path.join(resolved, "database.sqlite");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (sha256File(databasePath) !== manifest?.database?.sha256) {
    const error = new Error("Backup-DB hash wijkt af van het manifest.");
    error.code = "BACKUP_HASH_MISMATCH";
    throw error;
  }
  for (const asset of manifest.assets || []) {
    const filePath = path.resolve(resolved, "assets", asset.path);
    if (!isPathInside(path.join(resolved, "assets"), filePath) || sha256File(filePath) !== asset.sha256) {
      const error = new Error("Backup-asset hash wijkt af: " + asset.path);
      error.code = "BACKUP_ASSET_MISMATCH";
      throw error;
    }
  }
  const db = new DatabaseSync(databasePath, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").get()?.integrity_check;
  db.close();
  if (integrity !== "ok") {
    const error = new Error("Backupintegriteit is niet ok.");
    error.code = "BACKUP_INTEGRITY_FAILED";
    throw error;
  }
  return { ok: true, manifest, integrity };
}
