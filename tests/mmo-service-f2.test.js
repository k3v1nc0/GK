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

test("wereldsnapshots bevatten alleen live/grace-spelers en bewaren hun naam", function () {
  const { mmo } = service();
  try {
    const row = { player_id: "player_1", world_id: "world.main", x: 1, y: 0, z: 2, rotation_y: 0, revision: 3, animation_state: "idle", moving: false };
    mmo.playerStateCache.set("player_1::world.main", row);
    mmo.primaryPresenceByPlayerId.set("player_1", {
      playerId: "player_1", worldId: "world.main", displayName: "Kevin", modelAssetId: "model.ridder", selectedCharacterId: "class.ridder"
    });

    assert.deepEqual(mmo.getWorldPlayerStates("world.main"), [], "oude cachepositie is niet online");
    mmo.pendingDisconnectByPlayerId.set("player_1", { playerId: "player_1", worldId: "world.main" });
    assert.deepEqual(mmo.getWorldPlayerStates("world.main"), [row], "grace-speler blijft tijdelijk zichtbaar");
    assert.deepEqual(mmo.snapshotPlayerStateRecord(row), {
      playerId: "player_1", displayName: "Kevin", modelAssetId: "model.ridder", selectedCharacterId: "class.ridder", connectedSessionCount: 0,
      worldId: "world.main", zoneId: null, spawnId: null, x: 1, y: 0, z: 2, rotationY: 0, moving: false,
      animationState: "idle", revision: 3, lastProcessedInputSeq: 0, activeControllerSessionId: null, controllerEpoch: 0, teleport: false
    });
  } finally {
    mmo.shutdown();
  }
});

test("definitief vertrek ruimt de avatarcache op", function () {
  const { mmo } = service();
  try {
    const row = { player_id: "player_2", world_id: "world.main", x: 0, y: 0, z: 0, rotation_y: 0, revision: 1, updated_at: "t" };
    mmo.playerStateCache.set("player_2::world.main", row);
    mmo.latestInputByPlayerId.set("player_2", { input: {} });
    mmo.dirtyPlayerIdsByWorldId.set("world.main", new Set(["player_2"]));
    let left = null;
    mmo.broadcastRemotePlayerLeft = (connection) => { left = connection.player; };

    assert.equal(mmo.finalizePendingPlayerDisconnect({
      playerId: "player_2", worldId: "world.main", profile: { id: "player_2", display_name: "Anna" },
      userId: "user_2", sessionId: "session_2", timer: null
    }), true);
    assert.equal(left.display_name, "Anna");
    assert.equal(mmo.playerStateCache.has("player_2::world.main"), false);
    assert.equal(mmo.latestInputByPlayerId.has("player_2"), false);
    assert.equal(mmo.dirtyPlayerIdsByWorldId.has("world.main"), false);
  } finally {
    mmo.shutdown();
  }
});
