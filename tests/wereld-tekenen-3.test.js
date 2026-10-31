// Wereld tekenen ronde 3: water (Niet in / Doorheen / IJs), paden in de verf, begroeiing niet op steile hellingen of
// onder water, en deelgebieden los van het oude gebied.
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyTerrainPaintPath, createHeightfield, createPaintfield, normalizeTerrainWater, terrainPaintAt, terrainSlopeDegAt,
  terrainWaterAt, waterContains, waterCorners, TERRAIN_CHUNK_VERTS
} from "../apps/web/public/shared/terrain.js";
import { buildWalkabilityIndex, groundHeightAt, resolveMovement } from "../apps/web/public/shared/movement-kernel.js";
import { createSpatialIndex, resolveMembership } from "../apps/web/public/shared/spatial.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld, dropScatterOffTerrain } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
const serverData = (docs) => {
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  return JSON.parse(compiled.files["server.json"].text);
};

// Een kom: vak 0:0 is 4 m diep in het midden (x, z = 32), rand op 0.
function bowl() {
  const chunk = new Int16Array(TERRAIN_CHUNK_VERTS * TERRAIN_CHUNK_VERTS);
  for (let z = 0; z < TERRAIN_CHUNK_VERTS; z += 1) {
    for (let x = 0; x < TERRAIN_CHUNK_VERTS; x += 1) {
      const d = Math.hypot(x - 32, z - 32);
      chunk[z * TERRAIN_CHUNK_VERTS + x] = d < 20 ? Math.round(-400 * (1 - d / 20)) : 0;
    }
  }
  return createHeightfield(new Map([["0:0", chunk]]));
}

test("water: vorm, draaien, hoeken en hoogste water", () => {
  const water = normalizeTerrainWater({ id: "w", x: 10, z: 0, width: 20, depth: 4, rotation: 90, height: 1 });
  assert.equal(water.behavior, "block", "standaard Niet in");
  assert.equal(waterContains(water, 10, 9), true, "90 graden gedraaid: lang in z");
  assert.equal(waterContains(water, 19, 0), false);
  const corners = waterCorners(water);
  assert.equal(corners.length, 4);
  for (const corner of corners) assert.equal(waterContains(water, corner.x * 0.999 + 10 * 0.001, corner.z * 0.999), true);
  const low = normalizeTerrainWater({ id: "laag", x: 0, z: 0, width: 50, depth: 50, height: -1 });
  assert.equal(terrainWaterAt([low, water], 10, 0).id, "w", "hoogste water wint");
  assert.equal(normalizeTerrainWater({ x: 0, z: 0, width: 0, depth: 3 }), null);
});

test("lopen: Niet in houdt je tegen in diep water, Doorheen over de bodem, IJs bovenop", () => {
  const hf = bowl();
  const base = { ground: { width: 200, depth: 200, y: 0, minX: -100, maxX: 100, minZ: -100, maxZ: 100, boundsMode: "centerSize" } };
  const world = (behavior) => Object.assign({}, base, { terrain: { heightfield: { maxSlopeDeg: 80 }, water: [{ id: "meer", x: 32, z: 32, width: 40, depth: 40, height: -0.5, behavior }] } });
  const walk = (behavior, from, to) => resolveMovement(from, to, { index: buildWalkabilityIndex(world(behavior), { heightfield: hf }), radius: 0.3 });
  // Waterlijn van de kom ligt op z = 14,5. Droge oever tot daar is beloopbaar.
  const shore = walk("block", { x: 32, y: 0, z: 10 }, { x: 32, y: 0, z: 13.5 });
  assert.ok(shore.z > 13, "oever is beloopbaar (" + JSON.stringify(shore) + ")");
  // Je wordt al bij de waterlijn tegengehouden: de rand van de speler (0,3) komt niet in het water.
  const blocked = walk("block", { x: 32, y: 0, z: 14 }, { x: 32, y: 0, z: 17 });
  assert.ok(blocked.z < 14.3, "water houdt je bij de waterlijn tegen (" + JSON.stringify(blocked) + ")");
  // Schuin tegen de oever: je glijdt erlangs in plaats van stil te staan.
  const slide = walk("block", { x: 32, y: 0, z: 14.1 }, { x: 33, y: 0, z: 15 });
  assert.ok(slide.x > 32.2, "langs de oever glijden (" + JSON.stringify(slide) + ")");
  const out = walk("block", { x: 32, y: 0, z: 32 }, { x: 32, y: 0, z: 31 });
  assert.ok(out.z < 31.5, "wie al in diep water staat, mag eruit lopen");
  const deeper = walk("block", { x: 32, y: 0, z: 20 }, { x: 32, y: 0, z: 21 });
  assert.ok(deeper.z < 20.05, "in het water niet dieper in");
  // Steile oever (max 5 graden): aan de waterkant mag je toch omhoog (omlaag mocht al), anders zit je vast.
  const steep = Object.assign({}, base, { terrain: { heightfield: { maxSlopeDeg: 5 }, water: [{ id: "meer", x: 32, z: 32, width: 40, depth: 40, height: -0.5, behavior: "block" }] } });
  const climb = resolveMovement({ x: 32, y: 0, z: 15 }, { x: 32, y: 0, z: 13 }, { index: buildWalkabilityIndex(steep, { heightfield: hf }), radius: 0.3 });
  assert.ok(climb.z < 14, "niet vast aan de rand (" + JSON.stringify(climb) + ")");
  const wade = walk("wade", { x: 32, y: 0, z: 30.5 }, { x: 32, y: 0, z: 32 });
  assert.ok(wade.y < -3.5, "Doorheen: je loopt over de bodem (" + wade.y + ")");
  const ice = walk("ice", { x: 32, y: 0, z: 30.5 }, { x: 32, y: 0, z: 32 });
  assert.ok(Math.abs(ice.y + 0.5) < 0.01, "IJs: je loopt bovenop (" + ice.y + ")");
  const index = buildWalkabilityIndex(world("ice"), { heightfield: hf });
  assert.ok(Math.abs(groundHeightAt(index, 32, 32) + 0.5) < 0.01, "server zet je op het ijs");
  assert.equal(groundHeightAt(index, 90, 90), 0, "buiten het water gewoon de grond");
});

test("pad in de verf: breedte, zachte rand en niets ernaast", () => {
  const pf = createPaintfield();
  const result = applyTerrainPaintPath(pf, { texture: "terrain_texture:tex.zand", points: [{ x: 2, z: 10 }, { x: 60, z: 10 }], width: 4, fade: 1 });
  assert.ok(result.changed.has("0:0"));
  assert.ok(terrainPaintAt(pf, 30, 10)["terrain_texture:tex.zand"] > 0.95, "midden van het pad");
  assert.ok(terrainPaintAt(pf, 30, 11)["terrain_texture:tex.zand"] > 0.95, "binnen de breedte");
  const rand = terrainPaintAt(pf, 30, 11.5)["terrain_texture:tex.zand"] || 0;
  assert.ok(rand > 0.05 && rand < 0.95, "zachte rand (" + rand + ")");
  assert.equal(terrainPaintAt(pf, 30, 13)["terrain_texture:tex.zand"] || 0, 0, "naast het pad niets");
  assert.equal(applyTerrainPaintPath(pf, { texture: "", points: [{ x: 0, z: 0 }, { x: 5, z: 0 }] }).changed.size, 0);
});

test("kaarten: water, en deelgebied en obstakel zonder gebied", () => {
  const water = { waterId: "water.meer", displayName: "Meer", behavior: "ice", height: -0.5, x: 32, z: 32, width: 40, depth: 40 };
  assert.equal(validateDocument("terrain_water", water).ok, true);
  assert.equal(validateDocument("terrain_water", Object.assign({}, water, { behavior: "lava" })).ok, false);
  const dorp = { areaId: "area.dorp", displayName: "Dorp", shape: "box", minXMm: 0, maxXMm: 20000, minZMm: 0, maxZMm: 20000 };
  assert.equal(validateDocument("area", dorp).ok, true, "deelgebied mag los in de wereld");
  assert.equal(validateDocument("collider", { colliderId: "collider.rots", displayName: "Rots", shape: "cylinder", centerXMm: 0, centerZMm: 0, radiusMm: 2000 }).ok, true);
  const compiled = compileCanonical([doc("area", "area:area.dorp", dorp)], {});
  assert.deepEqual(compiled.errors, []);
  const world = JSON.parse(compiled.files["server.json"].text).world;
  assert.equal(world.areas[0].regionId, null);
  const index = createSpatialIndex(world);
  const inside = resolveMembership(index, 10000, 10000);
  assert.equal(inside.areaId, "area.dorp", "deelgebied werkt zonder gebied");
  assert.equal(inside.regionId, null);
  assert.equal(resolveMembership(index, 30000, 10000).areaId, null);
  assert.equal(resolveMembership(index, 20300, 10000, { regionId: null, areaId: "area.dorp" }).areaId, "area.dorp", "even over de rand blijft het dorp");
});

test("wereld: water uit de kaarten; begroeiing niet onder water of op te steile helling", () => {
  const data = serverData([doc("terrain_water", "terrain_water:water.meer",
    { waterId: "water.meer", displayName: "Meer", behavior: "wade", height: -0.5, x: 32, z: 32, width: 40, depth: 40, waves: false })]);
  const built = buildRuntimeWorld(data);
  assert.equal(built.terrain.water.length, 1);
  assert.equal(built.terrain.water[0].id, "water.meer");
  assert.equal(built.terrain.water[0].behavior, "wade");
  assert.equal(built.terrain.water[0].waves, false);
  const hf = bowl();
  assert.ok(terrainSlopeDegAt(hf, 32, 20) > 5 && terrainSlopeDegAt(hf, 90, 90) === 0);
  const tree = (id, x, z) => ({ id, type: "scatter", transform: { position: { x, y: 0, z } } });
  const world = { entities: [tree("nat", 32, 32), tree("droog", 90, 90), tree("steil", 32, 14), { id: "npc", type: "npc", transform: { position: { x: 32, y: 0, z: 32 } } }],
    terrain: { water: built.terrain.water, heightfield: { scatterSlopeDeg: 8 } } };
  const kept = dropScatterOffTerrain(world, hf).entities.map((entity) => entity.id);
  assert.deepEqual(kept, ["droog", "npc"], "onder water en te steil weg, NPC blijft");
});
