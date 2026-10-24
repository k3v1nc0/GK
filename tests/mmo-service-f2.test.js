// Fase 02: MmoService start, tickt en bewaart posities met de nieuwe klok en checkpointer (zonder server).
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { MmoService } from "../src/server/mmo-service.js";

function service() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE player_positions (
      player_id TEXT NOT NULL, world_id TEXT NOT NULL, current_zone_id TEXT, current_spawn_id TEXT,
      active_checkpoint_id TEXT, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL, rotation_y REAL NOT NULL,
      revision INTEGER NOT NULL, last_update_source_session_id TEXT, updated_at TEXT NOT NULL,
      PRIMARY KEY (player_id, world_id)
    );
  `);
  const repository = { getPublishedWorldPublishedAt: () => "", getPublishedWorld: () => null };
  const authService = { currentSession: () => null };
  return { db, mmo: new MmoService(db, authService, repository) };
}

test("MmoService start met wereldklok, checkpointer en meting; shutdown ruimt op", function () {
  const { mmo } = service();
  try {
    assert.ok(mmo.worldClock);
    const perf = mmo.serverPerfSnapshot();
    assert.ok(perf.clock && perf.positions && perf.eventLoopDelayMs);
    assert.equal(perf.positions.healthy, true);
    mmo.tickWorld(Date.now(), 50);
  } finally {
    mmo.shutdown();
  }
});

test("schedulePersist markeert alleen; de flush schrijft in een transactie; immediate schrijft direct", function () {
  const { db, mmo } = service();
  try {
    const row = { player_id: "p1", world_id: "w", current_zone_id: "z", x: 1, y: 0, z: 2, rotation_y: 0, revision: 1, last_update_source_session_id: null, updated_at: "t" };
    mmo.playerStateCache.set("p1::w", row);
    mmo.schedulePersist(row, null, false);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM player_positions").get().n, 0, "niets in de tick");
    mmo.positionCheckpoint.flushDue();
    assert.equal(db.prepare("SELECT x FROM player_positions").get().x, 1);
    row.x = 5;
    mmo.schedulePersist(row, null, true);
    assert.equal(db.prepare("SELECT x FROM player_positions").get().x, 5);
    assert.ok(mmo.serverPerfSnapshot().dbWritesMs.position_checkpoint.count >= 2);
  } finally {
    mmo.shutdown();
  }
});

test("join-ticket vereist een sessie", function () {
  const { mmo } = service();
  try {
    assert.throws(() => mmo.issueJoinTicket({ headers: {} }), { status: 401 });
  } finally {
    mmo.shutdown();
  }
});
