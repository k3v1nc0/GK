// F2-E2-T05: posities buiten de simtick bewaren, zonder stil verlies.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPositionCheckpointer } from "../src/server/persistence/position-checkpoint.js";

function setup(options = {}) {
  const rows = new Map();
  const written = [];
  let fail = false;
  const checkpoint = createPositionCheckpointer({
    getRow: (key) => rows.get(key) || null,
    write: (batch) => {
      if (fail) throw new Error("disk vol");
      written.push(batch.map((row) => ({ ...row })));
    },
    ...options
  });
  return { rows, written, checkpoint, setFail: (value) => { fail = value; } };
}

test("markDirty schrijft niets; flushDue schrijft de laatste stand in een batch", function () {
  const { rows, written, checkpoint } = setup();
  for (let tick = 0; tick < 100; tick++) {
    rows.set("p1", { player_id: "p1", x: tick });
    rows.set("p2", { player_id: "p2", x: -tick });
    checkpoint.markDirty("p1");
    checkpoint.markDirty("p2");
  }
  assert.equal(written.length, 0, "geen write tijdens de ticks");
  assert.equal(checkpoint.flushDue(), 2);
  assert.equal(written.length, 1);
  assert.deepEqual(written[0].map((row) => row.x), [99, -99]);
  assert.equal(checkpoint.pending(), 0);
});

test("fout: posities blijven vuil, checkpointer ongezond, herstel na geslaagde flush", function () {
  const { rows, checkpoint, setFail } = setup();
  rows.set("p1", { player_id: "p1", x: 1 });
  checkpoint.markDirty("p1");
  setFail(true);
  assert.equal(checkpoint.flushDue(), -1);
  assert.equal(checkpoint.pending(), 1);
  assert.equal(checkpoint.isHealthy(), false);
  setFail(false);
  assert.equal(checkpoint.flushDue(), 1);
  assert.equal(checkpoint.isHealthy(), true);
});

test("overflow boven maxPending is zichtbaar als ongezond", function () {
  const { rows, checkpoint } = setup({ maxPending: 3 });
  for (let i = 0; i < 4; i++) {
    rows.set("p" + i, { player_id: "p" + i });
    checkpoint.markDirty("p" + i);
  }
  assert.equal(checkpoint.isHealthy(), false);
  assert.equal(checkpoint.snapshot().maxPendingSeen, 4);
});

test("flushKey schrijft alleen die speler (zonewissel/logout)", function () {
  const { rows, written, checkpoint } = setup();
  rows.set("a", { player_id: "a" });
  rows.set("b", { player_id: "b" });
  checkpoint.markDirty("a");
  checkpoint.markDirty("b");
  checkpoint.flushKey("a");
  assert.deepEqual(written[0].map((row) => row.player_id), ["a"]);
  assert.equal(checkpoint.pending(), 1);
});

test("de tickroute in mmo-service schrijft posities niet meer synchroon", function () {
  const source = fs.readFileSync(new URL("../src/server/mmo-service.js", import.meta.url), "utf8");
  const start = source.indexOf("  schedulePersist(positionRow, connection, immediate = false) {");
  const end = source.indexOf("\n  }\n", start);
  const body = source.slice(start, end);
  assert.ok(!/db\.prepare|\.run\(/.test(body), "schedulePersist doet zelf geen SQL");
  assert.match(source, /POSITION_FLUSH_INTERVAL_MS = Math\.min\(5000/, "flushinterval is maximaal 5 s (RPO)");
});
