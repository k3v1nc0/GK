// Fase 04 (F4-E3-T01, eerste stuk): draft-preview gebruikt de opgeslagen (niet gepubliceerde) vormen en schrijft niets.
import assert from "node:assert/strict";
import test from "node:test";
import { CommandService } from "../src/server/authoring/command-service.js";
import { DocumentRepository } from "../src/server/authoring/document-repository.js";
import { previewMembership } from "../src/server/preview/preview-service.js";
import { authoringDb } from "./authoring-helpers.js";

function snapshot(db) {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  return JSON.stringify(tables.map((name) => [name, db.prepare("SELECT * FROM " + name).all()]));
}

test("preview: draft-vormen zonder publish, hysteresis over meerdere punten, DB bytegelijk", function () {
  const db = authoringDb();
  // Stand-ins voor spelerstate: mogen nooit veranderen door de preview.
  db.exec("CREATE TABLE player_positions (player_id TEXT, x REAL); INSERT INTO player_positions VALUES ('p1', 1.5);");
  db.exec("CREATE TABLE player_inventory (player_id TEXT, item_id TEXT); CREATE TABLE player_quest_progress (player_id TEXT);");
  const service = new CommandService(db);
  service.execute({ requestId: "req-prev-0001", command: "create", kind: "region", body: { regionId: "region.west", displayName: "West", minXMm: -50000, maxXMm: 0, minZMm: -50000, maxZMm: 50000 } }, "kevin");
  service.execute({ requestId: "req-prev-0002", command: "create", kind: "region", body: { regionId: "region.oost", displayName: "Oost", minXMm: 0, maxXMm: 50000, minZMm: -50000, maxZMm: 50000, musicAssetId: "music_oost" } }, "kevin");
  service.execute({ requestId: "req-prev-0003", command: "create", kind: "area", body: { areaId: "area.vijver", displayName: "Vijver", regionRef: "region:region.oost", shape: "cylinder", centerXMm: 20000, centerZMm: 0, radiusMm: 5000 } }, "kevin");
  const docs = new DocumentRepository(db).allDocuments();
  const before = snapshot(db);
  const result = previewMembership(docs, [{ x: -3, z: 0 }, { x: 0.2, z: 0 }, { x: 2, z: 0 }, { x: 20, z: 1 }], {
    assetTypes: new Map([["music_oost", "audio"]]), assetPaths: new Map([["music_oost", "/assets/uploads/oost.ogg"]])
  });
  assert.equal(result.draft, true);
  assert.deepEqual(result.results.map((r) => r.regionId), ["region.west", "region.west", "region.oost", "region.oost"], "0,2 m over de rand blijft West");
  assert.equal(result.results[3].areaName, "Vijver");
  assert.equal(result.results[2].musicUrl, "/assets/uploads/oost.ogg");
  assert.equal(result.results[0].cellKey, "-1_0");
  assert.equal(snapshot(db), before, "geen enkele rij gewijzigd (authoring, builds, release, spelerstate)");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM authoring_builds").get().n, 0, "geen build gemaakt");
  assert.throws(() => previewMembership(docs, [{ x: "a", z: 1 }]), { code: "PREVIEW_POINTS_INVALID" });
  assert.throws(() => previewMembership(docs, []), { code: "PREVIEW_POINTS_INVALID" });
  const empty = previewMembership([], [{ x: 1, z: 1 }]);
  assert.equal(empty.results[0].regionId, null);
});
