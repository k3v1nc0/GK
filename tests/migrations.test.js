import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyMigrations, openDatabase } from "../src/server/db.js";

function testRoot(label) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-migrations-" + label + "-"));
  fs.mkdirSync(path.join(rootDir, "db", "migrations"), { recursive: true });
  fs.mkdirSync(path.join(rootDir, "assets"), { recursive: true });
  return rootDir;
}

function writeMigration(rootDir, name, sql) {
  fs.writeFileSync(path.join(rootDir, "db", "migrations", name), sql);
}

test("echte migraties accepteren alleen de historische dubbele 006 en maken verifieerbare backups", async function () {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-real-migrations-"));
  const databasePath = path.join(rootDir, "db", "test.sqlite");
  const assetsPath = path.join(rootDir, "isolated-assets");
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(assetsPath, { recursive: true });
  fs.cpSync(path.resolve("db", "migrations"), path.join(rootDir, "db", "migrations"), { recursive: true });
  const previous = { root: process.env.GK_TEST_ROOT, db: process.env.DATABASE_PATH, assets: process.env.ASSETS_PATH };
  Object.assign(process.env, { GK_TEST_ISOLATED: "1", GK_TEST_ROOT: rootDir, DATABASE_PATH: databasePath, ASSETS_PATH: assetsPath });
  let db = null;
  try {
    db = await openDatabase(rootDir);
    assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM migrations").get().total, 11);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM migration_checksums").get().total, 11);
    const backupDirs = fs.readdirSync(path.join(rootDir, "db", "migration-backups"));
    assert.equal(backupDirs.length, 12, "baseline plus een backup voor elk van elf migratiebestanden");
  } finally {
    if (db) db.close();
    if (previous.root === undefined) delete process.env.GK_TEST_ROOT; else process.env.GK_TEST_ROOT = previous.root;
    if (previous.db === undefined) delete process.env.DATABASE_PATH; else process.env.DATABASE_PATH = previous.db;
    if (previous.assets === undefined) delete process.env.ASSETS_PATH; else process.env.ASSETS_PATH = previous.assets;
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

test("gewijzigde checksum en nieuwe dubbele prefix blokkeren startup", async function () {
  const checksumRoot = testRoot("checksum");
  const checksumDbPath = path.join(checksumRoot, "db.sqlite");
  writeMigration(checksumRoot, "011_first.sql", "CREATE TABLE first_table (id INTEGER PRIMARY KEY);");
  let db = new DatabaseSync(checksumDbPath);
  try {
    await applyMigrations(db, checksumRoot, checksumDbPath);
  } finally {
    db.close();
  }
  writeMigration(checksumRoot, "011_first.sql", "CREATE TABLE first_table (id INTEGER PRIMARY KEY, changed TEXT);");
  db = new DatabaseSync(checksumDbPath);
  try {
    await assert.rejects(applyMigrations(db, checksumRoot, checksumDbPath), { code: "MIGRATION_CHECKSUM_MISMATCH" });
  } finally {
    db.close();
    fs.rmSync(checksumRoot, { recursive: true, force: true });
  }

  const duplicateRoot = testRoot("duplicate");
  const duplicateDbPath = path.join(duplicateRoot, "db.sqlite");
  writeMigration(duplicateRoot, "011_first.sql", "SELECT 1;");
  writeMigration(duplicateRoot, "011_second.sql", "SELECT 1;");
  db = new DatabaseSync(duplicateDbPath);
  try {
    await assert.rejects(applyMigrations(db, duplicateRoot, duplicateDbPath), { code: "MIGRATION_PREFIX_DUPLICATE" });
  } finally {
    db.close();
    fs.rmSync(duplicateRoot, { recursive: true, force: true });
  }
});

test("ontbrekende backup blokkeert migratie en falende SQL rolt volledig terug", async function () {
  const rootDir = testRoot("failure");
  const databasePath = path.join(rootDir, "db.sqlite");
  writeMigration(rootDir, "011_failure.sql", "CREATE TABLE partial_table (id INTEGER); INSERT INTO missing_table VALUES (1);");
  let db = new DatabaseSync(databasePath);
  try {
    await assert.rejects(applyMigrations(db, rootDir, databasePath, {
      createBackup: async function () { throw Object.assign(new Error("backup ontbreekt"), { code: "BACKUP_REQUIRED" }); }
    }), { code: "BACKUP_REQUIRED" });
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'").get(), undefined);
  } finally {
    db.close();
  }

  db = new DatabaseSync(databasePath);
  try {
    await assert.rejects(applyMigrations(db, rootDir, databasePath));
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'partial_table'").get(), undefined);
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM migrations").get().total, 0);
  } finally {
    db.close();
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
