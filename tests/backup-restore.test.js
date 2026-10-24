import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { createDatabaseBackup } from "../src/server/backup-service.js";
import { restoreDatabaseBackup } from "../src/server/restore-service.js";
import { isDeniedPublicPath } from "../src/server/request-boundary.js";

test("backup herstelt DB en assets met gelijke tellingen en published hash", async function () {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-restore-test-"));
  const databasePath = path.join(rootDir, "source.sqlite");
  const assetsPath = path.join(rootDir, "isolated-assets");
  const backupDir = path.join(rootDir, "private", "backup");
  const restoreDir = path.join(rootDir, "private", "restore");
  fs.mkdirSync(path.join(assetsPath, "uploads"), { recursive: true });
  fs.writeFileSync(path.join(assetsPath, "uploads", "world.bin"), "world asset");
  const db = new DatabaseSync(databasePath);
  db.exec(`
    CREATE TABLE migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT INTO migrations VALUES ('010_editor_user_layouts.sql', 'now');
    CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('u1'), ('u2');
    CREATE TABLE player_profiles (id TEXT PRIMARY KEY); INSERT INTO player_profiles VALUES ('p1'), ('p2');
    CREATE TABLE player_positions (player_id TEXT, world_id TEXT); INSERT INTO player_positions VALUES ('p1', 'world'), ('p2', 'world');
    CREATE TABLE editor_nodes (id TEXT PRIMARY KEY); INSERT INTO editor_nodes VALUES ('n1');
    CREATE TABLE published_world_state (id INTEGER PRIMARY KEY, content_hash TEXT); INSERT INTO published_world_state VALUES (1, 'sha256:published');
  `);
  try {
    await createDatabaseBackup({ sourceDb: db, sourceDatabasePath: databasePath, assetsPath, targetDir: backupDir, rootDir, sourceSha: "restore-sha" });
    const result = restoreDatabaseBackup({ backupDir, targetDir: restoreDir, rootDir });
    assert.equal(result.integrity, "ok");
    assert.deepEqual(result.counts, { editor_nodes: 1, player_positions: 2, player_profiles: 2, users: 2 });
    assert.equal(result.publishedHash, "sha256:published");
    assert.equal(fs.readFileSync(path.join(result.assetsPath, "uploads", "world.bin"), "utf8"), "world asset");
    console.log("RESTORE_PROOF " + JSON.stringify({ integrity: result.integrity, counts: result.counts, publishedHash: result.publishedHash, assets: result.manifest.assets.length, sourceSha: result.manifest.sourceSha }));
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("restore weigert niet-lege/publieke doelen en webgrens weert secrets", function () {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-restore-deny-"));
  const targetDir = path.join(rootDir, "occupied");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(path.join(targetDir, "keep.txt"), "keep");
  try {
    assert.throws(() => restoreDatabaseBackup({ backupDir: path.join(rootDir, "missing"), targetDir, rootDir }), { code: "RESTORE_TARGET_NOT_EMPTY" });
    assert.equal(isDeniedPublicPath("/.env"), true);
    assert.equal(isDeniedPublicPath("/.git/config"), true);
    assert.equal(isDeniedPublicPath("/storage/database.sqlite"), true);
    assert.equal(isDeniedPublicPath("/%FF"), true);
    assert.equal(isDeniedPublicPath("/game/"), false);
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
