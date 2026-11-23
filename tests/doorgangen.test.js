// Doorgangen en binnenruimtes (22-11): kaart 🚪 Doorgang (kant A en B) en deelgebied met 🏠 Binnen.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { doorwayArrival, doorwayRefusal, indoorSettingsOf, outsidePointsByArea, parseDoorwayTarget, withinUseRange } from "../src/server/runtime/doorway-runtime.js";

const doorDoc = (id, body = {}) => ({ docKey: "doorway:" + id, kind: "doorway", archived: false,
  body: Object.assign({ doorwayId: id, displayName: id, x: 0, z: 0 }, body) });

test("doorgang-kaart is geldig en komt met twee kanten in de game-sectie", () => {
  assert.equal(validateDocument("doorway", doorDoc("huis").body).ok, true);
  const section = compileGameSection([
    doorDoc("huis", { x: 10, z: 20, rotationY: 180, bX: 5000, bZ: 5000, bRotationY: 0, useMode: "walk", oneWay: true }),
    doorDoc("grot", { x: -4, z: 2 })
  ], {});
  assert.deepEqual(section.errors, []);
  const huis = section.server.doorways.find((door) => door.doorwayId === "huis");
  assert.equal(huis.useMode, "walk");
  assert.equal(huis.oneWay, true);
  assert.deepEqual([huis.a.x, huis.a.z, huis.a.rotationY], [10, 20, 180]);
  assert.deepEqual([huis.b.x, huis.b.z], [5000, 5000]);
  const grot = section.server.doorways.find((door) => door.doorwayId === "grot");
  assert.deepEqual([grot.b.x, grot.b.z], [2, 2], "kant B nog niet neergezet = 6 m naast kant A");
  assert.equal(grot.useMode, "click");
});

test("de server weigert te ver, eenrichting, level, sleutel en gevecht", () => {
  const door = { id: "huis", displayName: "Huis", useMeters: 2, arriveMeters: 2.5, oneWay: false, minLevel: 5, keyItemId: "sleutel", combatBlockSeconds: 5,
    a: { x: 0, z: 0, rotationY: 0 }, b: { x: 1000, z: 0, rotationY: 90 } };
  const ok = { position: { x: 1, z: 0 }, level: 5, keyCount: 1, combatAgoMs: Infinity };
  assert.equal(doorwayRefusal(door, "a", ok), null);
  assert.match(doorwayRefusal(door, "a", Object.assign({}, ok, { position: { x: 10, z: 0 } })), /dichter/);
  assert.match(doorwayRefusal(door, "a", Object.assign({}, ok, { level: 4 })), /level 5/);
  assert.match(doorwayRefusal(door, "a", Object.assign({}, ok, { keyCount: 0, keyName: "Keldersleutel" })), /Keldersleutel/);
  assert.match(doorwayRefusal(door, "a", Object.assign({}, ok, { combatAgoMs: 1000 })), /gevecht/);
  assert.match(doorwayRefusal(Object.assign({}, door, { oneWay: true }), "b", Object.assign({}, ok, { position: { x: 1000, z: 0 } })), /één kant/);
  assert.equal(withinUseRange({ x: 3.4, z: 0 }, door, "a"), true, "2 m + speling");
  const arrive = doorwayArrival(door, "b");
  assert.equal(Math.round(arrive.x * 10) / 10, 1002.5, "voor kant B, de kant waar hij op kijkt");
  assert.deepEqual(parseDoorwayTarget("huis.bram:b"), { id: "huis.bram", side: "b" });
  assert.deepEqual(parseDoorwayTarget("huis"), { id: "huis", side: "a" });
});

test("binnen: de plek buiten bij de deur, ook via een trap tussen twee etages", () => {
  const doors = [
    { id: "voordeur", arriveMeters: 2, a: { x: 0, z: 0, rotationY: 0 }, b: { x: 5000, z: 0, rotationY: 0 } },
    { id: "trap", arriveMeters: 2, a: { x: 5010, z: 0, rotationY: 0 }, b: { x: 6000, z: 0, rotationY: 0 } }
  ];
  const areaIdAt = (x) => (x >= 4900 && x < 5100 ? "etage1" : x >= 5900 && x < 6100 ? "etage2" : null);
  const points = outsidePointsByArea(doors, new Set(["etage1", "etage2"]), areaIdAt);
  assert.equal(points.get("etage1").doorwayId, "voordeur");
  assert.equal(points.get("etage1").z, 2, "voor de voordeur buiten");
  assert.equal(points.get("etage2").doorwayId, "voordeur", "etage 2 gaat via de trap naar dezelfde deur buiten");
});

test("deelgebied met Binnen: geldig en de instellingen voor de game", () => {
  const body = { areaId: "area.huis", displayName: "Huis", shape: "box", minXMm: 0, maxXMm: 30000, minZMm: 0, maxZMm: 30000, indoor: true, indoorLight: 50 };
  assert.equal(validateDocument("area", body).ok, true);
  assert.equal(validateDocument("area", { areaId: "area.bos", displayName: "Bos", soort: "begroeiing", pointsMm: [[0, 0], [1000, 0], [0, 1000]], indoor: true }).ok, false, "alleen bij een deelgebied");
  assert.equal(indoorSettingsOf({ indoor: false }), null);
  const settings = indoorSettingsOf({ indoor: true, indoorLight: 50, indoorCameraPitch: 200 });
  assert.equal(settings.light, 0.5);
  assert.equal(settings.cameraPitch, 89, "binnen min/max");
  assert.equal(settings.background, "#000000");
  assert.deepEqual(settings.outline, null, "geen vorm = geen rand");
  const box = indoorSettingsOf({ indoor: true, shape: "box", minXMm: 0, maxXMm: 30000, minZMm: 0, maxZMm: 20000 });
  assert.deepEqual(box.outline, [[0, 0], [30, 0], [30, 20], [0, 20]], "rand in meters, voor zwart buiten het gebied");
});

test("Kevin 23-11: een heel deelgebied in één keer verven (vloer), en weer weghalen", async () => {
  const { applyTerrainPaintOutline, createPaintfield, terrainPaintAt } = await import("../apps/web/public/shared/terrain.js");
  const { areaOutlineMeters } = await import("../apps/web/public/shared/spatial.js");
  const pf = createPaintfield();
  const outline = areaOutlineMeters({ shape: "box", minXMm: 5000, maxXMm: 25000, minZMm: 5000, maxZMm: 15000 });
  const result = applyTerrainPaintOutline(pf, { outline, texture: "terrain_texture:tex.vloer", touched: new Set() });
  assert.ok(result.changed.size > 0);
  assert.ok(terrainPaintAt(pf, 15, 10)["terrain_texture:tex.vloer"] > 0.95, "binnen = helemaal vloer");
  assert.equal(terrainPaintAt(pf, 40, 10)["terrain_texture:tex.vloer"] || 0, 0, "buiten het deelgebied geen verf");
  applyTerrainPaintOutline(pf, { outline, texture: "" });
  assert.equal(terrainPaintAt(pf, 15, 10)["terrain_texture:tex.vloer"] || 0, 0, "gum haalt de vloer weg");
});
