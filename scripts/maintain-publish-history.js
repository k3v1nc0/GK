import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { resolveDatabasePath } from "../src/server/db.js";
import { loadEnvFile } from "../src/server/env.js";

const DEFAULT_KEEP = 50;
const SERVICE_NAME = "gk-real-node-editor.service";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

function usage() {
  return [
    "Gebruik: sh scripts/run-node24.sh scripts/maintain-publish-history.js [--apply] [--keep 50] [--db /pad/database.sqlite]",
    "",
    "Standaard is dry-run. Er wordt geen VACUUM uitgevoerd."
  ].join("\n");
}

function parseArgs(argv) {
  const options = { apply: false, keep: DEFAULT_KEEP, dbPath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      options.apply = true;
    } else if (arg === "--keep") {
      index += 1;
      options.keep = Number(argv[index]);
    } else if (arg === "--db") {
      index += 1;
      options.dbPath = String(argv[index] || "");
    } else if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error("Onbekende optie: " + arg + "\n" + usage());
    }
  }
  if (!Number.isInteger(options.keep) || options.keep < 1) {
    throw new Error("--keep moet een positief geheel getal zijn.");
  }
  return options;
}

function bytes(value) {
  return Number(value || 0);
}

function formatBytes(value) {
  const amount = bytes(value);
  const mib = amount / 1024 / 1024;
  return amount + " bytes (" + mib.toFixed(2) + " MiB)";
}

function fileSizeIfExists(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    if (error && error.code === "ENOENT") return 0;
    throw error;
  }
}

function serviceIsActive() {
  const result = spawnSync("systemctl", ["is-active", "--quiet", SERVICE_NAME], { stdio: "ignore" });
  return result.status === 0;
}

function retentionWhereSql() {
  return `
    id IN (
      SELECT id
      FROM publish_history
      ORDER BY published_at DESC, id DESC
      LIMIT -1 OFFSET ?
    )
  `;
}

function collectStats(db, keep) {
  const totalRows = db.prepare("SELECT COUNT(*) AS total FROM publish_history").get().total;
  const totalWorldJson = db.prepare("SELECT COALESCE(SUM(length(world_json)), 0) AS total FROM publish_history").get().total;
  const removable = db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(length(world_json)), 0) AS bytes FROM publish_history WHERE " + retentionWhereSql()).get(keep);
  const remainingAfterApply = Math.max(0, Number(totalRows) - Number(removable.total));
  return {
    totalRows: Number(totalRows),
    keep,
    removableRows: Number(removable.total),
    remainingAfterApply,
    totalWorldJsonBytes: bytes(totalWorldJson),
    removableWorldJsonBytes: bytes(removable.bytes)
  };
}

function runChecks(db) {
  const foreignKeyRows = db.prepare("PRAGMA foreign_key_check").all();
  const integrityRows = db.prepare("PRAGMA integrity_check").all();
  const integrityOk = integrityRows.length === 1 && Object.values(integrityRows[0])[0] === "ok";
  return {
    foreignKeyIssues: foreignKeyRows.length,
    integrity: integrityOk ? "ok" : "niet ok"
  };
}

function printReport(title, dbPath, fileStats, diskFreeBytes, stats, checks, apply) {
  console.log(title);
  console.log("database: " + dbPath);
  console.log("mode: " + (apply ? "apply" : "dry-run"));
  console.log("keep: " + stats.keep);
  console.log("database_size: " + formatBytes(fileStats.database));
  console.log("wal_size: " + formatBytes(fileStats.wal));
  console.log("shm_size: " + formatBytes(fileStats.shm));
  console.log("free_disk_at_database_path: " + formatBytes(diskFreeBytes));
  console.log("publish_history_records: " + stats.totalRows);
  console.log("records_to_delete: " + stats.removableRows);
  console.log("records_after_apply: " + stats.remainingAfterApply);
  console.log("publish_history_world_json_size: " + formatBytes(stats.totalWorldJsonBytes));
  console.log("world_json_bytes_to_delete: " + formatBytes(stats.removableWorldJsonBytes));
  console.log("foreign_key_check_issues: " + checks.foreignKeyIssues);
  console.log("integrity_check: " + checks.integrity);
  console.log("vacuum_executed: no");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnvFile(rootDir);
  const dbPath = path.resolve(options.dbPath || resolveDatabasePath(rootDir));
  if (!fs.existsSync(dbPath)) throw new Error("Database bestaat niet: " + dbPath);
  const stat = fs.statSync(dbPath);
  if (!stat.isFile()) throw new Error("Databasepad is geen bestand: " + dbPath);
  if (options.apply && serviceIsActive()) {
    throw new Error(SERVICE_NAME + " draait nog; stop de service voordat --apply wordt uitgevoerd.");
  }

  const dirStats = fs.statfsSync(path.dirname(dbPath));
  const diskFreeBytes = Number(dirStats.bavail) * Number(dirStats.bsize);
  const fileStats = {
    database: stat.size,
    wal: fileSizeIfExists(dbPath + "-wal"),
    shm: fileSizeIfExists(dbPath + "-shm")
  };
  const db = new DatabaseSync(dbPath, { readOnly: !options.apply });
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("PRAGMA busy_timeout = 5000;");
    const beforeStats = collectStats(db, options.keep);
    const beforeChecks = runChecks(db);
    printReport("Voor onderhoud", dbPath, fileStats, diskFreeBytes, beforeStats, beforeChecks, options.apply);
    if (!options.apply) return;
    if (beforeChecks.foreignKeyIssues !== 0 || beforeChecks.integrity !== "ok") {
      throw new Error("Databasecontrole faalt voor wijziging; onderhoud afgebroken.");
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM publish_history WHERE " + retentionWhereSql()).run(options.keep);
      const afterChecks = runChecks(db);
      if (afterChecks.foreignKeyIssues !== 0 || afterChecks.integrity !== "ok") {
        throw new Error("Databasecontrole faalt na wijziging; transactie wordt teruggedraaid.");
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    const afterStats = collectStats(db, options.keep);
    const afterChecks = runChecks(db);
    printReport("Na onderhoud", dbPath, fileStats, diskFreeBytes, afterStats, afterChecks, options.apply);
  } finally {
    db.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
