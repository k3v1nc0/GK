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
  // Kevin 23-11: A buiten (z=-0.5) en B binnen (z=0.5) bij één muur; B kijkt verkeerd om (naar A) = toch binnen aankomen.
  const wallDoor = { id: "huis", arriveMeters: 2.5, a: { x: 0, z: -0.5, rotationY: 180 }, b: { x: 0, z: 0.5, rotationY: 180 } };
  assert.equal(Math.round(doorwayArrival(wallDoor, "b").z * 10) / 10, 3, "door A: binnen aankomen, ook als B naar de muur kijkt");
  assert.equal(Math.round(doorwayArrival(wallDoor, "a").z * 10) / 10, -3, "door B: buiten aankomen");
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

test("Kevin 23-11: uit een 🏠 Binnen-gebied loop je niet weg (rand dicht), in de editor wel", async () => {
  const { indoorEdgeBlockers, applyCanonicalBuild } = await import("../src/server/authoring/runtime-overlay.js");
  const { createWalkabilityIndex, isPointBlockedByBlocker } = await import("../apps/web/public/shared/movement-kernel.js");
  const area = { areaId: "huis", displayName: "Huis", indoor: true, shape: "box", minXMm: 0, maxXMm: 10000, minZMm: 0, maxZMm: 8000 };
  const blockers = indoorEdgeBlockers([area, { areaId: "buiten", shape: "box", minXMm: 0, maxXMm: 1000, minZMm: 0, maxZMm: 1000 }]);
  assert.equal(blockers.length, 4, "vier randen, alleen van het binnen-gebied");
  const index = createWalkabilityIndex({ collision: { blockers } });
  assert.equal(isPointBlockedByBlocker(index, 10, 4, 0.3), true, "tegen de rechterrand");
  assert.equal(isPointBlockedByBlocker(index, 5, 0, 0.3), true, "tegen de voorrand");
  assert.equal(isPointBlockedByBlocker(index, 5, 4, 0.3), false, "midden in de kamer");
  const base = { gameProject: { zones: {} }, collision: { blockers: [] } };
  const build = { data: { world: { areas: [area] } } };
  assert.equal(applyCanonicalBuild(base, build).collision.blockers.filter((blocker) => blocker.reason === "indoor").length, 4);
  assert.equal((applyCanonicalBuild(base, build, { editor: true }).collision?.blockers || []).length, 0, "editor: geen rand");
});

test("Kevin 23-11: binnen als eigen ruimte: vloer van het deelgebied in de wereld en in de binnen-instellingen", async () => {
  const { applyCanonicalBuild } = await import("../src/server/authoring/runtime-overlay.js");
  const area = { areaId: "huis", displayName: "Huis", indoor: true, indoorFloorRef: "terrain_texture:steen", shape: "box", minXMm: 0, maxXMm: 10000, minZMm: 0, maxZMm: 8000 };
  assert.equal(indoorSettingsOf(area).floor, "terrain_texture:steen");
  assert.equal(indoorSettingsOf(Object.assign({}, area, { indoorFloorRef: null })).floor, null);
  const base = { gameProject: { zones: {} }, collision: { blockers: [] } };
  const floors = applyCanonicalBuild(base, { data: { world: { areas: [area] } } }, { editor: true }).indoorFloors;
  assert.equal(floors.length, 1, "ook in de editor, om te kunnen bouwen");
  assert.equal(floors[0].floorRef, "terrain_texture:steen");
  assert.deepEqual([floors[0].x, floors[0].z], [5, 4]);
  assert.equal(validateDocument("area", { areaId: "huis", displayName: "Huis", shape: "box", minXMm: 0, maxXMm: 1000, minZMm: 0, maxZMm: 1000, indoor: true, indoorFloorRef: "terrain_texture:steen" }).ok, true);
});

test("Kevin 23-11: 🏠 Binnen-zone ver achter de kaart: eigen rand voor lopen, grijze vloer, de wereld komt er nooit bij", async () => {
  const { INDOOR_ZONE, groundTooCloseToIndoorZone, inIndoorZone } = await import("../apps/web/public/shared/indoor-zone.js");
  const { clampPointToGround, worldGroundForCollision } = await import("../apps/web/public/shared/movement-kernel.js");
  const { indoorFloors } = await import("../src/server/authoring/runtime-overlay.js");
  const { CANONICAL_KINDS } = await import("../src/shared/authoring/kinds.js");
  // De grootste wereld (Wereld > Grootte, max) blijft ver van de zone.
  const maxHalf = CANONICAL_KINDS.world_settings.fields.groundSize.max / 2;
  assert.equal(groundTooCloseToIndoorZone({ minX: -maxHalf, maxX: maxHalf, minZ: -maxHalf, maxZ: maxHalf }), false);
  assert.equal(groundTooCloseToIndoorZone({ minX: -45000, maxX: 45000, minZ: -45000, maxZ: 45000 }), true);
  // Lopen in de zone: de rand van de wereld zet je niet terug.
  const ground = worldGroundForCollision({ ground: { boundsMode: "centerSize", width: 500, depth: 500, y: 0 } });
  const inside = clampPointToGround({ x: INDOOR_ZONE.centerX + 3, y: 0, z: 7 }, ground, 0.4);
  assert.deepEqual([inside.x, inside.z], [INDOOR_ZONE.centerX + 3, 7]);
  const outside = clampPointToGround({ x: 900, y: 0, z: 0 }, ground, 0.4);
  assert.equal(outside.x, 249.6, "buiten blijft de rand van de wereld");
  // Een binnenruimte in de zone heeft altijd een vloer; buiten de zone alleen met een gekozen Vloer.
  const room = { areaId: "huis", indoor: true, shape: "box", minXMm: 50000000, maxXMm: 50010000, minZMm: 0, maxZMm: 8000 };
  const strook = { areaId: "strook", indoor: true, shape: "box", minXMm: 0, maxXMm: 10000, minZMm: 0, maxZMm: 8000 };
  const floors = indoorFloors([room, strook]);
  assert.deepEqual(floors.map((floor) => [floor.areaId, floor.floorRef]), [["huis", null]]);
  assert.equal(inIndoorZone(floors[0].x, floors[0].z), true);
});

test("Kevin 23-11: binnen houdt de speler zijn eigen camera, van boven alleen als het deelgebied dat vraagt", () => {
  const area = { areaId: "huis", indoor: true, shape: "box", minXMm: 0, maxXMm: 10000, minZMm: 0, maxZMm: 8000 };
  assert.equal(indoorSettingsOf(area).topDown, false);
  assert.equal(indoorSettingsOf(Object.assign({}, area, { indoorTopDown: true })).topDown, true);
  assert.equal(validateDocument("area", { areaId: "huis", displayName: "Huis", shape: "box", minXMm: 0, maxXMm: 1000, minZMm: 0, maxZMm: 1000, indoor: true, indoorTopDown: true }).ok, true);
});

test("Kevin 24-11: elke kant heet naar het deelgebied aan de andere kant; zelf invullen gaat voor; binnen op de minimap", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
  const docs = [
    doc("project_settings", "project_settings", { gameName: "GK" }),
    doc("area", "area:dorp", { areaId: "dorp", displayName: "Dorp 1", shape: "box", minXMm: 0, maxXMm: 100000, minZMm: 0, maxZMm: 100000 }),
    doc("area", "area:hal", { areaId: "hal", displayName: "Kasteel Hal", shape: "box", minXMm: 50000000, maxXMm: 50020000, minZMm: 0, maxZMm: 20000, indoor: true }),
    doc("doorway", "doorway:poort", { doorwayId: "poort", displayName: "Poort", x: 10, z: 10, bX: 50005, bZ: 5 }),
    doc("doorway", "doorway:eigen", { doorwayId: "eigen", displayName: "Eigen", x: 20, z: 20, bX: 50006, bZ: 6, sideName: "Kasteel" })
  ];
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  const world = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
  const poort = world.doorways.find((door) => door.id === "poort");
  assert.deepEqual([poort.a.name, poort.b.name], ["Kasteel Hal", "Dorp 1"]);
  const eigen = world.doorways.find((door) => door.id === "eigen");
  assert.deepEqual([eigen.a.name, eigen.b.name], ["Kasteel", "Dorp 1"], "zelf ingevuld gaat voor");
  const hal = world.minimap.game.indoors.find((entry) => entry.id === "hal");
  assert.ok(hal, "binnenruimte op de minimap");
  assert.ok(["10,10", "20,20"].includes(Math.round(hal.out.x) + "," + Math.round(hal.out.z)), "buiten: bij een deur (kant A)");
  assert.ok(["50005,5", "50006,6"].includes(Math.round(hal.in.x) + "," + Math.round(hal.in.z)), "binnen: bij een deur (kant B)");
});

test("Kevin 24-11: kamers die tegen elkaar liggen zijn één gebouw; deuren tussen de kamers staan in de minimap", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
  const room = (id, minX, maxX) => doc("area", "area:" + id, { areaId: id, displayName: id, shape: "box", minXMm: minX * 1000, maxXMm: maxX * 1000, minZMm: 0, maxZMm: 10000, indoor: true });
  const docs = [
    doc("project_settings", "project_settings", { gameName: "GK" }),
    room("hal", 50000, 50010), room("gang", 50010, 50020), room("zaal", 50020, 50030), room("schuur", 50100, 50110),
    // buiten -> hal, hal -> gang met een deur; gang -> zaal is een open gat (geen deur).
    doc("doorway", "doorway:poort", { doorwayId: "poort", displayName: "Poort", x: 10, z: 10, bX: 50002, bZ: 5 }),
    doc("doorway", "doorway:binnen", { doorwayId: "binnen", displayName: "Binnendeur", x: 50009, z: 5, bX: 50011, bZ: 5 })
  ];
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  const game = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).minimap.game;
  const byId = Object.fromEntries(game.indoors.map((entry) => [entry.id, entry]));
  assert.equal(byId.hal.group, byId.gang.group);
  assert.equal(byId.gang.group, byId.zaal.group);
  assert.notEqual(byId.schuur.group, byId.hal.group, "los gebouw");
  assert.deepEqual(byId.gang.walk, ["zaal"], "open gat: zo doorlopen");
  assert.deepEqual(byId.hal.walk, [], "met een deur ertussen geen open gat");
  const rooms = game.indoorDoors.map((door) => [door.a.room, door.b.room].join(">")).sort();
  assert.deepEqual(rooms, [">hal", "hal>gang"]);
});

test("Kevin 24-11: een vijand slaat niet door een dunne muur heen (zichtlijn ziet de muur)", async () => {
  const { lineOfSightBlocked } = await import("../src/server/runtime/line-of-sight.js");
  const { createWalkabilityIndex } = await import("../apps/web/public/shared/movement-kernel.js");
  const { wallBlockers } = await import("../apps/web/public/shared/walls.js");
  const wall = { id: "muur", points: [{ x: 1.3, z: -5 }, { x: 1.3, z: 5 }], thickness: 0.2, height: 3 };
  const index = createWalkabilityIndex({ collision: { blockers: wallBlockers(wall) } });
  // Van x=0 naar x=3: de muur (1.2 tot 1.4) valt tussen de stapjes van 50 cm, maar telt toch.
  assert.equal(lineOfSightBlocked({ walkabilityIndex: index }, 0, 0, 3, 0), true);
  assert.equal(lineOfSightBlocked({ walkabilityIndex: index }, 0, 0, 0, 3), false, "langs de muur: vrij");
});
