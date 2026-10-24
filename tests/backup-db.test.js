import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDatabaseBackup, verifyBackup } from "../src/server/backup-service.js";

function hash(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fixture() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-backup-test-"));
  const databasePath = path.join(rootDir, "source.sqlite");
  const assetsPath = path.join(rootDir, "isolated-assets");
  fs.mkdirSync(path.join(assetsPath, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(assetsPath, "uploads", "fixture.bin"), "isolated asset");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO migrations VALUES ('010_editor_user_layouts.sql', '2026-10-23T00:00:00.000Z');
    CREATE TABLE published_world_state (id INTEGER PRIMARY KEY, world_json TEXT, build_id TEXT, schema_version TEXT, content_hash TEXT, published_at TEXT);
    INSERT INTO published_world_state VALUES (1, '{}', 'build_fixture', 'v1', 'content_fixture', '2026-10-23T00:00:00.000Z');
    CREATE TABLE users (id TEXT PRIMARY KEY);
    INSERT INTO users VALUES ('user_fixture');
  `);
  return { rootDir, databasePath, assetsPath, db, cleanup: () => fs.rmSync(rootDir, { recursive: true, force: true }) };
}

test("online backup is integer, hash-verifieerbaar en bevat assets", async function () {
  const value = fixture();
  try {
    const sourceBefore = hash(value.databasePath);
    const targetDir = path.join(value.rootDir, "private-backups", "backup-001");
    const result = await createDatabaseBackup({
      sourceDb: value.db,
      sourceDatabasePath: value.databasePath,
      assetsPath: value.assetsPath,
      targetDir,
      rootDir: value.rootDir,
      sourceSha: "abc123"
    });
    const verified = verifyBackup(targetDir);
    assert.equal(verified.integrity, "ok");
    assert.equal(result.manifest.sourceSha, "abc123");
    assert.deepEqual(result.manifest.database.migrationHead, ["010_editor_user_layouts.sql"]);
    assert.equal(result.manifest.publishedBuild.content_hash, "content_fixture");
    assert.equal(result.manifest.assets.length, 1);
    assert.equal(hash(value.databasePath), sourceBefore);
  } finally {
    value.db.close();
    value.cleanup();
  }
});

test("publiek backupdoel wordt geweigerd", async function () {
  const value = fixture();
  try {
    const publicTarget = path.join(value.rootDir, "apps", "web", "public", "backup");
    await assert.rejects(createDatabaseBackup({
      sourceDb: value.db,
      sourceDatabasePath: value.databasePath,
      assetsPath: value.assetsPath,
      targetDir: publicTarget,
      rootDir: value.rootDir,
      sourceSha: "abc123"
    }), { code: "PUBLIC_BACKUP_TARGET" });
  } finally {
    value.db.close();
    value.cleanup();
  }
});

test("falende backup laat bron en doel ongemoeid", async function () {
  const value = fixture();
  try {
    const sourceBefore = hash(value.databasePath);
    const targetDir = path.join(value.rootDir, "private-backups", "failed");
    await assert.rejects(createDatabaseBackup({
      sourceDb: value.db,
      sourceDatabasePath: value.databasePath,
      assetsPath: value.assetsPath,
      targetDir,
      rootDir: value.rootDir,
      sourceSha: "abc123",
      backupImpl: async function () { throw new Error("opzettelijke backupfout"); }
    }), /opzettelijke backupfout/);
    assert.equal(hash(value.databasePath), sourceBefore);
    assert.equal(fs.existsSync(targetDir), false);
  } finally {
    value.db.close();
    value.cleanup();
  }
});
