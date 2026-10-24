import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createIsolatedRuntime, requireIsolatedMode } from "./lib/test-isolation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function percentile(sorted, value) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((value / 100) * sorted.length) - 1));
  return sorted[index];
}

function summary(samples) {
  const sorted = samples.slice().sort((left, right) => left - right);
  return { count: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95), p99: percentile(sorted, 99), max: sorted[sorted.length - 1] || 0 };
}

function measureWrites(db, actionType, count, callback) {
  const samples = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      callback(index);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    samples.push(performance.now() - started);
  }
  return { actionType, samplesMs: samples, percentilesMs: summary(samples) };
}

async function main() {
  requireIsolatedMode();
  const runtime = await createIsolatedRuntime(rootDir, "perf-server");
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const db = new DatabaseSync(runtime.databasePath);
  try {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE position_samples (player_id TEXT PRIMARY KEY, x REAL, z REAL, updated_at TEXT);
      CREATE TABLE critical_receipts (operation_id TEXT PRIMARY KEY, player_id TEXT, payload_hash TEXT, amount INTEGER, created_at TEXT);
      CREATE TABLE publish_samples (id INTEGER PRIMARY KEY, content_hash TEXT, world_json TEXT, published_at TEXT);
    `);
    const writeSamples = [
      measureWrites(db, "position_checkpoint", 100, (index) => {
        db.prepare("INSERT INTO position_samples VALUES ('p1', ?, ?, ?) ON CONFLICT(player_id) DO UPDATE SET x=excluded.x,z=excluded.z,updated_at=excluded.updated_at")
          .run(index / 10, index / 20, new Date().toISOString());
      }),
      measureWrites(db, "critical_receipt", 100, (index) => {
        db.prepare("INSERT INTO critical_receipts VALUES (?, 'p1', ?, ?, ?)")
          .run("op_" + index, crypto.createHash("sha256").update("payload_" + index).digest("hex"), index, new Date().toISOString());
      }),
      measureWrites(db, "publish_pointer", 50, (index) => {
        db.prepare("INSERT INTO publish_samples VALUES (1, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET content_hash=excluded.content_hash,world_json=excluded.world_json,published_at=excluded.published_at")
          .run("hash_" + index, JSON.stringify({ revision: index, entities: Array.from({ length: 50 }, (_, entityIndex) => ({ id: entityIndex })) }), new Date().toISOString());
      })
    ];

    const tickSamples = [];
    for (const players of [1, 2]) {
      for (let tick = 0; tick < 120; tick += 1) {
        const started = performance.now();
        let checksum = 0;
        for (let player = 0; player < players; player += 1) {
          const x = Math.sin((tick + player) / 10) * 20;
          const z = Math.cos((tick + player) / 10) * 20;
          checksum += Math.hypot(x, z);
        }
        tickSamples.push({ players, tick, durationMs: performance.now() - started, checksum });
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
    eventLoop.disable();

    const scene = { scenario: "f1-baseline", players: [1, 2], ticksPerPlayerCount: 120, writeSamplesPerType: [100, 100, 50] };
    const result = {
      schemaVersion: "gk-f1-baseline-v1",
      measuredAt: new Date().toISOString(),
      commitSha: process.env.GITHUB_SHA || process.env.RELEASE_SHA || "working-tree",
      machine: {
        platform: process.platform,
        release: os.release(),
        architecture: os.arch(),
        cpuModel: os.cpus()[0]?.model || "unknown",
        cpuCount: os.cpus().length,
        memoryBytes: os.totalmem(),
        node: process.version,
        energyProfile: process.env.GK_ENERGY_PROFILE || "unknown"
      },
      browser: { status: "not_measured", name: null, version: null, width: null, height: null, reason: "Browsermeting vereist de toegestane localhost:3001-handrun." },
      scene,
      contentHash: crypto.createHash("sha256").update(JSON.stringify(scene)).digest("hex"),
      databaseBytes: Object.fromEntries(["main", "wal", "shm", "total"].map((key) => [key, 0])),
      writes: writeSamples,
      ticks: {
        raw: tickSamples,
        byPlayerCount: Object.fromEntries([1, 2].map((players) => [players, summary(tickSamples.filter((sample) => sample.players === players).map((sample) => sample.durationMs))]))
      },
      eventLoopDelayMs: {
        min: eventLoop.min / 1e6,
        mean: eventLoop.mean / 1e6,
        max: eventLoop.max / 1e6,
        p50: eventLoop.percentile(50) / 1e6,
        p95: eventLoop.percentile(95) / 1e6,
        p99: eventLoop.percentile(99) / 1e6
      },
      capacityClaim: null
    };
    result.databaseBytes.main = fs.existsSync(runtime.databasePath) ? fs.statSync(runtime.databasePath).size : 0;
    result.databaseBytes.wal = fs.existsSync(runtime.databasePath + "-wal") ? fs.statSync(runtime.databasePath + "-wal").size : 0;
    result.databaseBytes.shm = fs.existsSync(runtime.databasePath + "-shm") ? fs.statSync(runtime.databasePath + "-shm").size : 0;
    result.databaseBytes.total = result.databaseBytes.main + result.databaseBytes.wal + result.databaseBytes.shm;
    const outputDir = path.resolve(process.env.GK_PERF_OUTPUT_DIR || path.join(rootDir, "README", "fases", "evidence", "MMORPG-v2", "F1"));
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "baseline-server.json"), JSON.stringify(result, null, 2) + "\n");
    const csvRows = ["category,action_or_players,index,duration_ms"];
    for (const write of writeSamples) write.samplesMs.forEach((duration, index) => csvRows.push(["write", write.actionType, index, duration].join(",")));
    for (const tick of tickSamples) csvRows.push(["tick", tick.players, tick.tick, tick.durationMs].join(","));
    fs.writeFileSync(path.join(outputDir, "baseline-server.csv"), csvRows.join("\n") + "\n");
    console.log(JSON.stringify({ ok: true, outputDir, databaseBytes: result.databaseBytes, writes: Object.fromEntries(writeSamples.map((entry) => [entry.actionType, entry.percentilesMs])), ticks: result.ticks.byPlayerCount, eventLoopDelayMs: result.eventLoopDelayMs, browser: result.browser.status }, null, 2));
  } finally {
    eventLoop.disable();
    db.close();
    runtime.cleanup();
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
