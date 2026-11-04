// Wereld tekenen ronde 3: water (Niet in / Doorheen / IJs), begroeiing niet op steile hellingen of
// onder water, en deelgebieden los van het oude gebied.
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHeightfield, createPaintfield, normalizeTerrainWater, terrainHeightAt, terrainPaintAt, terrainSlopeDegAt,
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
  // Steile oever (max 5 graden): uit het water mag je altijd, maar daarna geldt de helling ook naast het water
  // (Kevin 2-11: niet over een steile oever heen). Langs de waterkant lopen blijft wel kunnen.
  const steep = Object.assign({}, base, { terrain: { heightfield: { maxSlopeDeg: 5 }, water: [{ id: "meer", x: 32, z: 32, width: 40, depth: 40, height: -0.5, behavior: "block" }] } });
  const steepIndex = buildWalkabilityIndex(steep, { heightfield: hf });
  const climb = resolveMovement({ x: 32, y: 0, z: 15 }, { x: 32, y: 0, z: 13 }, { index: steepIndex, radius: 0.3 });
  assert.ok(climb.z < 14.5, "uit het water (" + JSON.stringify(climb) + ")");
  assert.ok(climb.z > 13.5, "niet de steile oever op (" + JSON.stringify(climb) + ")");
  const along = resolveMovement(climb, { x: climb.x + 1, y: climb.y, z: climb.z }, { index: steepIndex, radius: 0.3 });
  assert.ok(along.x > climb.x + 0.3, "langs de waterkant lopen kan (" + JSON.stringify(along) + ")");
  const wade = walk("wade", { x: 32, y: 0, z: 30.5 }, { x: 32, y: 0, z: 32 });
  assert.ok(wade.y < -3.5, "Doorheen: je loopt over de bodem (" + wade.y + ")");
  const ice = walk("ice", { x: 32, y: 0, z: 30.5 }, { x: 32, y: 0, z: 32 });
  assert.ok(Math.abs(ice.y + 0.5) < 0.01, "IJs: je loopt bovenop (" + ice.y + ")");
  const index = buildWalkabilityIndex(world("ice"), { heightfield: hf });
  assert.ok(Math.abs(groundHeightAt(index, 32, 32) + 0.5) < 0.01, "server zet je op het ijs");
  assert.equal(groundHeightAt(index, 90, 90), 0, "buiten het water gewoon de grond");
});

test("lopen: clientstappen en serverticks blijven gelijk langs water met een steile oever", () => {
  const hf = bowl();
  const world = {
    ground: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, boundsMode: "explicitBounds", width: 64, depth: 64, y: 0 },
    terrain: {
      heightfield: { maxSlopeDeg: 5 },
      water: [{ id: "meer", x: 32, z: 32, width: 40, depth: 40, height: -0.5, behavior: "block" }]
    }
  };
  const index = buildWalkabilityIndex(world, { heightfield: hf });
  const start = { x: 32, y: terrainHeightAt(hf, 32, 14.3), z: 14.3 };
  const heading = 316 * Math.PI / 180;
  const simulate = (stepMs, speed) => {
    let position = { ...start };
    let stoppedSteps = 0;
    for (let elapsed = 0; elapsed < 1200; elapsed += stepMs) {
      const distance = speed * stepMs / 1000;
      const next = resolveMovement(position, {
        x: position.x + Math.cos(heading) * distance,
        y: position.y,
        z: position.z + Math.sin(heading) * distance
      }, { index, radius: 0.5 });
      if (Math.hypot(next.x - position.x, next.z - position.z) < 0.000001) stoppedSteps += 1;
      position = next;
    }
    return { position, stoppedSteps };
  };

  for (const speed of [6, 9.6]) {
    const client = simulate(16, speed);
    const server = simulate(20, speed);
    const difference = Math.hypot(client.position.x - server.position.x, client.position.z - server.position.z);
    assert.equal(client.stoppedSteps, 0, "client blijft langs de oever lopen");
    assert.equal(server.stoppedSteps, 0, "server blijft langs de oever lopen");
    assert.ok(difference < 0.1, "16 en 20 ms eindigen gelijk bij " + speed + " m/s (verschil " + difference.toFixed(3) + " m)");
    assert.ok(client.position.x > start.x + 3, "loopt werkelijk langs de waterkant");
    assert.ok(Math.abs(client.position.y - start.y) < 0.1, "blijft op dezelfde hoogtelijn en klimt niet de steile oever op");
  }
});

test("lopen: in de hoek van water en een steile berg loop je niet langs de berg het water in (3-11)", () => {
  // Berg (63 graden) vanaf x = 32, water (Niet in) voor z < 28,5 met een diepe bodem eronder.
  const chunk = new Int16Array(TERRAIN_CHUNK_VERTS * TERRAIN_CHUNK_VERTS);
  for (let z = 0; z < TERRAIN_CHUNK_VERTS; z += 1) {
    for (let x = 0; x < TERRAIN_CHUNK_VERTS; x += 1) chunk[z * TERRAIN_CHUNK_VERTS + x] = Math.round(((z < 29 ? -1.5 : 0) + Math.max(0, (x - 32) * 2)) * 100);
  }
  const hf = createHeightfield(new Map([["0:0", chunk]]));
  const index = buildWalkabilityIndex({
    ground: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, boundsMode: "explicitBounds", width: 64, depth: 64, y: 0 },
    terrain: { heightfield: { maxSlopeDeg: 50 }, water: [{ id: "meer", x: 20, z: 14, width: 40, depth: 29, height: 0, behavior: "block" }] }
  }, { heightfield: hf });
  for (const degrees of [0, 20, 45, 70, 90]) {
    for (const stepMs of [16, 20]) {
      const angle = degrees * Math.PI / 180;
      const heading = { x: Math.cos(angle - Math.PI / 4), z: -Math.sin(angle + Math.PI / 4) };
      let position = { x: 29, y: 0, z: 31 };
      let highest = 0;
      for (let elapsed = 0; elapsed < 3000; elapsed += stepMs) {
        const distance = 9.6 * stepMs / 1000;
        position = resolveMovement(position, { x: position.x + heading.x * distance, y: position.y, z: position.z + heading.z * distance }, { index, radius: 0.5 });
        highest = Math.max(highest, position.y);
      }
      assert.ok(highest < 0.3, degrees + " graden, " + stepMs + " ms: niet de berg op (" + highest.toFixed(2) + " m)");
      assert.ok(position.z > 28.5, degrees + " graden, " + stepMs + " ms: niet langs de berg het water in (z " + position.z.toFixed(1) + ")");
    }
  }
});

test("lopen: over een brug over het water, en Instellingen > Water (lopen) (3-11)", () => {
  // Rivier x 28..36 ("Niet in"), brug (loopvlak) van x 25 tot 39.
  const chunk = new Int16Array(TERRAIN_CHUNK_VERTS * TERRAIN_CHUNK_VERTS);
  for (let z = 0; z < TERRAIN_CHUNK_VERTS; z += 1) {
    for (let x = 0; x < TERRAIN_CHUNK_VERTS; x += 1) chunk[z * TERRAIN_CHUNK_VERTS + x] = x > 27 && x < 37 ? -150 : (x === 27 || x === 37 ? -50 : 0);
  }
  const hf = createHeightfield(new Map([["0:0", chunk]]));
  const world = (bridge, waterWalk = null) => ({
    ground: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, boundsMode: "explicitBounds", width: 64, depth: 64, y: 0 },
    terrain: { heightfield: { maxSlopeDeg: 50 }, waterWalk, water: [{ id: "rivier", x: 32, z: 32, width: 10, depth: 64, height: -0.2, behavior: "block" }] },
    collision: { blockers: [], walkableSurfaces: bridge ? [{ id: "brug", x: 32, y: 0.3, z: 32, width: 14, depth: 3, priority: 10, closedEdges: [0, 2],
      points: [{ x: 25, y: 0.3, z: 30.5 }, { x: 39, y: 0.3, z: 30.5 }, { x: 39, y: 0.3, z: 33.5 }, { x: 25, y: 0.3, z: 33.5 }] }] : [] }
  });
  const run = (data, from, dir) => {
    const index = buildWalkabilityIndex(data, { heightfield: hf });
    let position = { x: from, y: 0, z: 32 };
    for (let elapsed = 0; elapsed < 3000; elapsed += 16) {
      position = resolveMovement(position, { x: position.x + dir * 0.1536, y: position.y, z: position.z }, { index, radius: 0.5 });
    }
    return position;
  };
  assert.ok(run(world(true), 18, 1).x > 40, "van links over de brug");
  assert.ok(run(world(true), 46, -1).x < 24, "van rechts over de brug");
  const plain = run(world(false), 18, 1).x;
  assert.ok(plain < 27, "zonder brug stop je bij het water (" + plain.toFixed(2) + ")");
  const feet = run(world(false, { edgeRound: false, waterEdgeInset: 0.3, waterBlockDepth: 0.02 }), 18, 1).x;
  assert.ok(feet > plain + 0.2, "voeten in het water: je komt dichterbij (" + feet.toFixed(2) + ")");
  const wade = run(world(false, { edgeRound: false, waterEdgeInset: 0, waterBlockDepth: 2 }), 18, 1).x;
  assert.ok(wade > 40, "ondiep genoeg: je loopt erdoor (" + wade.toFixed(2) + ")");
  const compiled = compileCanonical([doc("project_settings", "project_settings", { gameName: "GK" }),
    doc("water_walk_settings", "water_walk_settings", { waterEdgeInset: 0.2 })], {});
  assert.deepEqual(compiled.errors, []);
  assert.deepEqual(buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).terrain.waterWalk,
    { edgeRound: true, edgeDistance: 0.7, edgeSmooth: 1.5, edgeSteep: true, waterEdgeInset: 0.2, waterBlockDepth: 0.02, edgeCell: 0.5,
      routeSearchSize: 16000, routeMaxSpacing: 8 });
  // Afgeronde rand aan: ook dan over de brug, en zonder brug op afstand van het water.
  const round = { edgeRound: true, edgeDistance: 0.7, edgeSmooth: 1.5, edgeSteep: true, waterBlockDepth: 0.02, edgeCell: 0.5 };
  assert.ok(run(world(true, round), 18, 1).x > 40, "afgeronde rand: over de brug");
  const kept = run(world(false, round), 18, 1).x;
  assert.ok(kept < 27.8 - 0.6, "afgeronde rand: op afstand van het water (" + kept.toFixed(2) + ")");
  assert.equal(validateDocument("water_walk_settings", { waterEdgeInset: 2 }).ok, false, "buiten min/max mag niet");
});

test("lopen: afgeronde rand houdt je van water en rots af, je glijdt erlangs en komt nooit de wand op (3-11)", () => {
  // Kartelige rotswand (63 graden) met water ervoor: een smal strand van x 29 tot de voet van de wand.
  const foot = (z) => 33 + 0.4 * Math.sin(z * 3);
  const chunk = new Int16Array(TERRAIN_CHUNK_VERTS * TERRAIN_CHUNK_VERTS);
  for (let z = 0; z < TERRAIN_CHUNK_VERTS; z += 1) {
    for (let x = 0; x < TERRAIN_CHUNK_VERTS; x += 1) chunk[z * TERRAIN_CHUNK_VERTS + x] = Math.round((x < 26 ? -1.5 : Math.max(0, (x - foot(z)) * 2)) * 100);
  }
  const hf = createHeightfield(new Map([["0:0", chunk]]));
  const index = buildWalkabilityIndex({
    ground: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, boundsMode: "explicitBounds", width: 64, depth: 64, y: 0 },
    terrain: { heightfield: { maxSlopeDeg: 50 }, waterWalk: { edgeRound: true, edgeDistance: 0.7, edgeSmooth: 1.5, edgeSteep: true, waterBlockDepth: 0.02, edgeCell: 0.5 },
      water: [{ id: "meer", x: 12.5, z: 32, width: 25, depth: 64, height: -0.3, behavior: "block" }] }
  }, { heightfield: hf });
  for (const toward of [1, -1]) {
    for (const degrees of [10, 30]) {
      const ends = [];
      for (const stepMs of [16, 20]) {
        const angle = degrees * Math.PI / 180;
        let position = { x: 28.5, y: 0, z: 8 };
        let stopped = 0;
        let highest = 0;
        let closest = Infinity;
        for (let elapsed = 0; elapsed < 4000; elapsed += stepMs) {
          const distance = 9.6 * stepMs / 1000;
          const next = resolveMovement(position, { x: position.x + toward * Math.sin(angle) * distance, y: position.y, z: position.z + Math.cos(angle) * distance }, { index, radius: 0.5 });
          if (Math.hypot(next.x - position.x, next.z - position.z) < 0.000001) stopped += 1;
          position = next;
          highest = Math.max(highest, position.y);
          closest = Math.min(closest, position.x - 25);
        }
        const label = (toward > 0 ? "naar de rots " : "naar het water ") + degrees + " graden, " + stepMs + " ms";
        assert.equal(stopped, 0, label + ": nooit vast");
        assert.ok(highest < 0.5, label + ": niet de rots op (" + highest.toFixed(2) + " m)");
        assert.ok(closest > 0.6, label + ": op afstand van het water (" + closest.toFixed(2) + " m)");
        assert.ok(position.z > 30, label + ": loopt echt door (" + position.z.toFixed(1) + ")");
        ends.push(position);
      }
      assert.ok(Math.hypot(ends[0].x - ends[1].x, ends[0].z - ends[1].z) < 0.3, "game en server eindigen gelijk");
    }
  }
  // Gespawnd op de rotswand: je kunt eraf, maar niet verder omhoog.
  const onWall = { x: 34.5, y: terrainHeightAt(hf, 34.5, 20), z: 20 };
  const up = resolveMovement(onWall, { x: 36, y: onWall.y, z: 20 }, { index, radius: 0.5 });
  assert.ok(up.y <= onWall.y + 0.01, "op de wand niet verder omhoog");
  const down = resolveMovement(onWall, { x: 33, y: onWall.y, z: 20 }, { index, radius: 0.5 });
  assert.ok(down.x < 34, "van de wand af kan wel");
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
