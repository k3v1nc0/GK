import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { MmoService } from "../src/server/mmo-service.js";

function setup(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  db.exec(`CREATE TABLE player_fog_discovery_cells (
    player_id TEXT, world_id TEXT, map_layer TEXT, cell_key TEXT,
    discovery_type TEXT, source_area_id TEXT, discovered_at TEXT, updated_at TEXT,
    PRIMARY KEY (player_id, world_id, map_layer, cell_key)
  )`);
  const service = Object.assign(Object.create(MmoService.prototype), { db });
  return {
    db,
    insert: (keys) => service.insertFogDiscoveryCells("player", "world", "overworld", keys),
    count: () => db.prepare("SELECT COUNT(*) AS n FROM player_fog_discovery_cells").get().n
  };
}

test("kaartontdekking buiten een spelactie slaat op zonder dubbele vakjes", (t) => {
  const { db, insert, count } = setup(t);
  assert.deepEqual(insert(["1:1", "2:2"]), ["1:1", "2:2"]);
  assert.deepEqual(insert(["1:1"]), []);
  assert.equal(db.isTransaction, false);
  assert.equal(count(), 2);
});

test("kaartontdekking tijdens Unstuck gebruikt de lopende transactie", (t) => {
  const { db, insert, count } = setup(t);
  db.exec("BEGIN IMMEDIATE");
  assert.deepEqual(insert(["1:1"]), ["1:1"]);
  assert.equal(db.isTransaction, true, "de spelactie beslist wanneer er wordt opgeslagen");
  db.exec("COMMIT");
  assert.equal(count(), 1);
});

test("mislukte spelactie draait ook de kaartontdekking terug", (t) => {
  const { db, insert, count } = setup(t);
  db.exec("BEGIN IMMEDIATE");
  insert(["1:1"]);
  db.exec("ROLLBACK");
  assert.equal(count(), 0);
});

test("kaartfout laat het terugdraaien over aan de lopende spelactie", (t) => {
  const { db, insert, count } = setup(t);
  db.exec(`CREATE TRIGGER reject_cell BEFORE INSERT ON player_fog_discovery_cells
    WHEN NEW.cell_key = '2:2' BEGIN SELECT RAISE(ABORT, 'kaartfout'); END`);
  db.exec("BEGIN IMMEDIATE");
  assert.throws(() => insert(["1:1", "2:2"]), /kaartfout/);
  assert.equal(db.isTransaction, true);
  db.exec("ROLLBACK");
  assert.equal(count(), 0);
});
