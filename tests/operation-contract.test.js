// F2-E2-T06/T07/T08: kritieke operaties exact een keer, ook bij herhaling, gelijktijdige claims en crash.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { commitOperation, replayOperation, runOperation, OPERATION_ERROR } from "../src/server/persistence/operation-contract.js";

const contractUrl = new URL("../src/server/persistence/operation-contract.js", import.meta.url).href;

const SCHEMA = `
  CREATE TABLE operation_idempotency (
    operation_id TEXT PRIMARY KEY,
    player_id TEXT,
    operation_type TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    result_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    expires_at TEXT
  );
  CREATE TABLE targets (id TEXT PRIMARY KEY, alive INTEGER NOT NULL);
  CREATE TABLE grants (id INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT, player_id TEXT, item TEXT);
`;

function openDb(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(SCHEMA);
  db.prepare("INSERT INTO targets (id, alive) VALUES ('wolf', 1)").run();
  return db;
}

// Kill + loot zoals node03: alleen als het doel nog leeft, en in dezelfde transactie als de receipt.
function killAndLoot(db, operationId, playerId, hooks = {}) {
  return runOperation(db, {
    operationId,
    playerId,
    operationType: "attack",
    requestHash: "hash-attack-wolf",
    faultHook: hooks.faultHook || null,
    perform() {
      const target = db.prepare("SELECT alive FROM targets WHERE id = 'wolf'").get();
      if (!target.alive) return { killed: false, loot: [] };
      db.prepare("UPDATE targets SET alive = 0 WHERE id = 'wolf'").run();
      db.prepare("INSERT INTO grants (operation_id, player_id, item) VALUES (?, ?, 'wolf_pelt')").run(operationId, playerId);
      return { killed: true, loot: ["wolf_pelt"] };
    }
  });
}

function count(db, sql) {
  return db.prepare(sql).get().n;
}

test("gelijke ID en payload geven hetzelfde receipt zonder tweede grant", function () {
  const db = openDb();
  const first = killAndLoot(db, "op-1", "p1");
  const second = killAndLoot(db, "op-1", "p1");
  assert.equal(first.killed, true);
  assert.equal(second.idempotent, true);
  assert.deepEqual(second.loot, first.loot);
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 1);
});

test("gelijke ID met andere payload of andere speler geeft 409", function () {
  const db = openDb();
  killAndLoot(db, "op-1", "p1");
  assert.throws(() => replayOperation(db, { operationId: "op-1", playerId: "p1", requestHash: "anders" }), { status: 409, code: OPERATION_ERROR.PAYLOAD_MISMATCH });
  assert.throws(() => replayOperation(db, { operationId: "op-1", playerId: "p2", requestHash: "hash-attack-wolf" }), { status: 409, code: OPERATION_ERROR.OTHER_PLAYER });
});

test("twee gelijktijdige claims op dezelfde kill geven een grant", function () {
  const db = openDb();
  const a = killAndLoot(db, "op-a", "p1");
  const b = killAndLoot(db, "op-b", "p2");
  assert.equal([a, b].filter((r) => r.killed).length, 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM operation_idempotency WHERE status = 'completed'"), 2);
});

test("fout voor COMMIT laat nul receipts en nul grants; opnieuw proberen geeft er een", function () {
  const db = openDb();
  assert.throws(() => killAndLoot(db, "op-1", "p1", { faultHook: (stage) => { if (stage === "after_perform") throw new Error("crash"); } }), /crash/);
  assert.equal(count(db, "SELECT COUNT(*) n FROM operation_idempotency"), 0);
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 0);
  assert.equal(killAndLoot(db, "op-1", "p1").killed, true);
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 1);
});

test("fout na COMMIT: receipt staat, herhaling na reconnect dupliceert niets", function () {
  const db = openDb();
  assert.throws(() => killAndLoot(db, "op-1", "p1", { faultHook: (stage) => { if (stage === "after_commit") throw new Error("verbinding weg"); } }));
  const retry = killAndLoot(db, "op-1", "p1");
  assert.equal(retry.idempotent, true);
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 1);
});

test("procescrash midden in de transactie: na herstart nul of een grant, nooit twee", function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-opcrash-"));
  try {
    for (const stage of ["after_perform", "after_commit"]) {
      const file = path.join(dir, stage + ".sqlite");
      const setup = openDb(file);
      setup.exec("PRAGMA journal_mode = WAL");
      setup.close();
      const script = `
        import { DatabaseSync } from "node:sqlite";
        import { runOperation } from ${JSON.stringify(contractUrl)};
        const db = new DatabaseSync(${JSON.stringify(file)});
        runOperation(db, {
          operationId: "op-crash", playerId: "p1", operationType: "attack", requestHash: "h",
          faultHook(stage) { if (stage === ${JSON.stringify(stage)}) process.exit(9); },
          perform() {
            db.prepare("UPDATE targets SET alive = 0 WHERE id = 'wolf'").run();
            db.prepare("INSERT INTO grants (operation_id, player_id, item) VALUES ('op-crash', 'p1', 'wolf_pelt')").run();
            return { killed: true };
          }
        });`;
      const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
      assert.equal(child.status, 9, child.stderr);
      const db = new DatabaseSync(file);
      const grants = count(db, "SELECT COUNT(*) n FROM grants");
      const receipts = count(db, "SELECT COUNT(*) n FROM operation_idempotency WHERE status = 'completed'");
      assert.equal(grants, stage === "after_commit" ? 1 : 0, stage);
      assert.equal(receipts, grants, "receipt en grant horen bij elkaar (" + stage + ")");
      db.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("quest turn-in: dubbele turn-in verandert status en beloning een keer", function () {
  const db = openDb();
  db.exec("CREATE TABLE quests (id TEXT PRIMARY KEY, status TEXT); INSERT INTO quests VALUES ('q1', 'ready');");
  function turnIn(operationId) {
    return runOperation(db, {
      operationId,
      playerId: "p1",
      operationType: "turn_in",
      requestHash: "turn_in:q1",
      perform() {
        const quest = db.prepare("SELECT status FROM quests WHERE id = 'q1'").get();
        if (quest.status !== "ready") {
          const error = new Error("Quest is niet klaar om in te leveren.");
          error.status = 409;
          throw error;
        }
        db.prepare("UPDATE quests SET status = 'turned_in' WHERE id = 'q1'").run();
        db.prepare("INSERT INTO grants (operation_id, player_id, item) VALUES (?, 'p1', 'gold:10')").run(operationId);
        return { status: "turned_in" };
      }
    });
  }
  assert.equal(turnIn("t1").status, "turned_in");
  assert.equal(turnIn("t1").idempotent, true);
  assert.throws(() => turnIn("t2"), { status: 409 });
  assert.equal(count(db, "SELECT COUNT(*) n FROM grants"), 1);
  assert.equal(count(db, "SELECT COUNT(*) n FROM operation_idempotency"), 1, "mislukte turn-in laat geen receipt");
});

test("commitOperation is synchroon en heeft geen worker nodig", function () {
  const db = openDb();
  const result = commitOperation(db, { operationId: "s1", playerId: "p1", operationType: "x", requestHash: "h", perform: () => ({ v: 1 }) });
  assert.equal(typeof result.then, "undefined");
  assert.equal(result.v, 1);
});
