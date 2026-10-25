// Fase 04 (F4-E1-T02 + F4-E2-T01): Region/Area via commands, ruimteregels en de compile met Cells.
import assert from "node:assert/strict";
import test from "node:test";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { CommandService } from "../src/server/authoring/command-service.js";
import { DocumentRepository } from "../src/server/authoring/document-repository.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { authoringDb, graphHash } from "./authoring-helpers.js";

const west = { regionId: "region.west", displayName: "West", minXMm: -50000, maxXMm: 0, minZMm: -50000, maxZMm: 50000 };
const oost = { regionId: "region.oost", displayName: "Oost", minXMm: 0, maxXMm: 50000, minZMm: -50000, maxZMm: 50000 };
const plein = { areaId: "area.plein", displayName: "Plein", regionRef: "region:region.oost", shape: "box", minXMm: 10000, maxXMm: 30000, minZMm: -10000, maxZMm: 10000 };
const fontein = { areaId: "area.fontein", displayName: "Fontein", regionRef: "region:region.oost", shape: "cylinder", centerXMm: 20000, centerZMm: 0, radiusMm: 3000, priority: 5, musicAssetId: "music_fontein" };
const bos = { areaId: "area.bos", displayName: "Bos", regionRef: "region:region.west", shape: "polygon", pointsMm: [[-40000, -40000], [-10000, -40000], [-10000, -10000]] };

let seq = 0;
const req = () => "req-world-" + String(++seq).padStart(6, "0");

test("kinds: region/area vectors en vormregels", function () {
  assert.equal(validateDocument("region", west).ok, true);
  assert.equal(validateDocument("region", Object.assign({}, west, { maxXMm: -50000 })).issues[0].code, "REGION_EMPTY");
  assert.equal(validateDocument("region", Object.assign({}, west, { minXMm: 1.5 })).issues[0].code, "FIELD_INTEGER");
  assert.equal(validateDocument("area", plein).ok, true);
  assert.equal(validateDocument("area", fontein).ok, true);
  assert.equal(validateDocument("area", bos).ok, true);
  assert.deepEqual(validateDocument("area", plein).refs, ["region:region.oost"]);
  assert.equal(validateDocument("area", Object.assign({}, plein, { radiusMm: 5000 })).issues[0].code, "SHAPE_FIELD");
  const noRadius = Object.assign({}, fontein); delete noRadius.radiusMm;
  assert.equal(validateDocument("area", noRadius).issues[0].code, "FIELD_REQUIRED");
  assert.equal(validateDocument("area", Object.assign({}, bos, { pointsMm: [[0, 0], [1, 1]] })).issues[0].code, "FIELD_RANGE");
  assert.equal(validateDocument("area", Object.assign({}, bos, { pointsMm: [[0, 0], [10, 10], [10, 0], [0, 10]] })).issues[0].code, "POLYGON_SELF_INTERSECTS");
  assert.equal(validateDocument("area", Object.assign({}, bos, { pointsMm: [[0, 0], [1.5, 1], [3, 0]] })).issues[0].code, "FIELD_POINT");
  assert.equal(validateDocument("area", Object.assign({}, plein, { shape: "sphere" })).issues[0].code, "FIELD_OPTION");
});

test("commands: overlappende Regions en Area buiten eigenaar blokkeren; transfer houdt world-mm gelijk; CAS blijft", function () {
  const db = authoringDb();
  const graphBefore = graphHash(db);
  const service = new CommandService(db);
  const docs = new DocumentRepository(db);
  service.execute({ requestId: req(), command: "create", kind: "region", body: west }, "kevin");
  service.execute({ requestId: req(), command: "create", kind: "region", body: oost }, "kevin"); // raakt west op x=0: mag
  assert.throws(() => service.execute({ requestId: req(), command: "create", kind: "region", body: Object.assign({}, oost, { regionId: "region.midden", minXMm: -1000 }) }, "kevin"),
    { status: 422, code: "REGION_OVERLAP" });
  service.execute({ requestId: req(), command: "create", kind: "area", body: plein }, "kevin");
  service.execute({ requestId: req(), command: "create", kind: "area", body: fontein }, "kevin");
  service.execute({ requestId: req(), command: "create", kind: "area", body: bos }, "kevin");
  // Area die over de rand van zijn Region steekt.
  assert.throws(() => service.execute({ requestId: req(), command: "create", kind: "area", body: Object.assign({}, plein, { areaId: "area.rand", minXMm: -5000 }) }, "kevin"),
    { status: 422, code: "AREA_OUTSIDE_REGION" });
  // Region kleiner maken zodat een Area eruit valt: blokkeert ook.
  const oostDoc = docs.get("region:region.oost");
  assert.throws(() => service.execute({ requestId: req(), command: "update", docKey: oostDoc.docKey, body: Object.assign({}, oost, { maxXMm: 20000 }), expectedRevision: oostDoc.revision }, "kevin"),
    { status: 422, code: "AREA_OUTSIDE_REGION" });
  // Region groter maken zodat hij de buurman overlapt: blokkeert.
  assert.throws(() => service.execute({ requestId: req(), command: "update", docKey: oostDoc.docKey, body: Object.assign({}, oost, { minXMm: -1 }), expectedRevision: oostDoc.revision }, "kevin"),
    { status: 422, code: "REGION_OVERLAP" });
  // Stale revision: 409, ook voor ruimte-documenten.
  assert.throws(() => service.execute({ requestId: req(), command: "update", docKey: oostDoc.docKey, body: Object.assign({}, oost, { displayName: "Oost 2" }), expectedRevision: oostDoc.revision + 5 }, "kevin"),
    { status: 409, code: "STALE_REVISION" });
  // Region met Areas kan niet weg.
  assert.throws(() => service.execute({ requestId: req(), command: "archive", docKey: oostDoc.docKey, expectedRevision: oostDoc.revision }, "kevin"), { code: "REF_IN_USE" });
  // Opslaan houdt world-mm exact gelijk (geen omrekening of afronding in de opslag).
  assert.deepEqual(docs.get("area:area.bos").body.pointsMm, bos.pointsMm);
  // Een Area naar een Region verhuizen waar hij niet in ligt, blokkeert.
  const bosDoc = docs.get("area:area.bos");
  assert.throws(() => service.execute({ requestId: req(), command: "update", docKey: bosDoc.docKey, body: Object.assign({}, bos, { regionRef: "region:region.oost" }), expectedRevision: bosDoc.revision }, "kevin"),
    { code: "AREA_OUTSIDE_REGION" }, "bos ligt in west, niet in oost");
  service.execute({ requestId: req(), command: "create", kind: "region", body: { regionId: "region.noord", displayName: "Noord", minXMm: -50000, maxXMm: 50000, minZMm: 50000, maxZMm: 90000 } }, "kevin");
  const veld = { areaId: "area.veld", displayName: "Veld", regionRef: "region:region.noord", shape: "box", minXMm: -10000, maxXMm: 10000, minZMm: 60000, maxZMm: 70000 };
  service.execute({ requestId: req(), command: "create", kind: "area", body: veld }, "kevin");
  const veldDoc = docs.get("area:area.veld");
  // Archiveren en terugzetten: terugzetten checkt de ruimteregels opnieuw.
  service.execute({ requestId: req(), command: "archive", docKey: veldDoc.docKey, expectedRevision: veldDoc.revision }, "kevin");
  const noordDoc = docs.get("region:region.noord");
  service.execute({ requestId: req(), command: "archive", docKey: noordDoc.docKey, expectedRevision: noordDoc.revision }, "kevin");
  service.execute({ requestId: req(), command: "create", kind: "region", body: { regionId: "region.noord2", displayName: "Noord 2", minXMm: -50000, maxXMm: 50000, minZMm: 50000, maxZMm: 90000 } }, "kevin");
  const archivedNoord = docs.get("region:region.noord");
  assert.throws(() => service.execute({ requestId: req(), command: "restore", docKey: archivedNoord.docKey, expectedRevision: archivedNoord.revision }, "kevin"), { code: "REGION_OVERLAP" });
  assert.equal(graphHash(db), graphBefore, "ruimtecommands raken de nodegraph niet");
});

test("compile: Cells bytegelijk, negatieve Cells en gedeelde rand, geen server-only veld in client, F3-build onveranderd", function () {
  const doc = (kind, body, archived = false) => ({ docKey: kind + ":" + (body.regionId || body.areaId || body.itemId), kind, revision: 1, body, archived, legacyRef: null });
  const item = doc("item_definition", { itemId: "item.ore", displayName: "Erts", category: "material", rarity: "common", stackable: true, stackLimit: 99 });
  const f3Only = compileCanonical([item]);
  assert.equal(JSON.parse(f3Only.files["client.json"].text).world, undefined, "zonder Regions geen world-sleutel");
  const docs = [item, doc("region", west), doc("region", oost), doc("area", plein), doc("area", fontein), doc("area", bos)];
  const options = { assetTypes: new Map([["music_fontein", "audio"]]), assetPaths: new Map([["music_fontein", "/assets/uploads/fontein.mp3"]]) };
  const a = compileCanonical(docs, options);
  const b = compileCanonical(docs.slice().reverse(), options);
  assert.deepEqual(a.errors, []);
  assert.equal(a.files["client.json"].text, b.files["client.json"].text, "zelfde input = bytegelijke cellen");
  assert.equal(a.rootSha256, b.rootSha256);
  const client = JSON.parse(a.files["client.json"].text).world;
  const server = JSON.parse(a.files["server.json"].text).world;
  assert.equal(client.cellSizeMm, 64000);
  assert.deepEqual(client.cells["-1_-1"].regions, ["region.west"]);
  assert.deepEqual(client.cells["0_0"].regions, ["region.oost"], "x=0 hoort niet meer bij west (half-open)");
  assert.equal(client.cells["-1_0"].regions.includes("region.oost"), false);
  assert.deepEqual(client.cells["0_0"].areas, ["area.fontein", "area.plein"]);
  assert.deepEqual(client.cells["-1_-1"].areas, ["area.bos"]);
  assert.equal(client.areas.find((area) => area.areaId === "area.fontein").priority, undefined, "prioriteit is server-only");
  assert.equal(server.areas.find((area) => area.areaId === "area.fontein").priority, 5);
  assert.equal(client.areas[0].regionRef, undefined);
  assert.ok(client.areas.every((area) => area.regionId.startsWith("region.")));
  assert.equal(client.audio.music_fontein, "/assets/uploads/fontein.mp3");
  // Fout-input blokkeert publish (vangnet als data buiten commands om binnenkomt).
  const overlap = compileCanonical(docs.concat([doc("region", Object.assign({}, oost, { regionId: "region.dubbel" }))]), options);
  assert.equal(overlap.errors[0].code, "REGION_OVERLAP");
  const wrongAsset = compileCanonical(docs, { assetTypes: new Map([["music_fontein", "image"]]) });
  assert.equal(wrongAsset.errors[0].code, "ASSET_TYPE");
  const huge = compileCanonical([doc("region", { regionId: "region.groot", displayName: "Groot", minXMm: 0, maxXMm: 64000 * 100, minZMm: 0, maxZMm: 64000 * 100 })]);
  assert.equal(huge.errors[0].code, "SHAPE_TOO_LARGE");
  // Gearchiveerde vormen tellen niet mee.
  const archived = compileCanonical([item, doc("region", west, true)]);
  assert.equal(JSON.parse(archived.files["client.json"].text).world, undefined);
});
