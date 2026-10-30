// Wereld tekenen ronde 1: hoogte per vak (terrain.js), lopen op hellingen (kernel), objecten optillen
// (wereldbouwer), opslaan van vakken (assets) en de kaart "Terrein".
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TERRAIN_CHUNK_BYTES, createHeightfield, decodeTerrainChunk, encodeTerrainChunk, terrainHeightAt, terrainVertexCm,
  applyTerrainBrush, buildTerrainChunkMesh, terrainChunkErrors, countTerrainChunkTriangles, raycastTerrain, terrainChunkIsFlat
} from "../apps/web/public/shared/terrain.js";
import { createWalkabilityIndex, groundHeightAt, resolveMovement, heightfieldForWorld } from "../apps/web/public/shared/movement-kernel.js";
import { buildRuntimeWorld, liftWorldOntoTerrain } from "../src/server/authoring/world-builder.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { AssetService } from "../src/server/asset-service.js";

function hillField(height = 10, radius = 20, cx = 0, cz = 0) {
  const hf = createHeightfield();
  // Een heuvel: veel penseelstappen verhogen in het midden.
  for (let i = 0; i < 200; i += 1) applyTerrainBrush(hf, { mode: "raise", x: cx, z: cz, radius, strength: 1, softness: 1, dt: 0.01 });
  const top = terrainHeightAt(hf, cx, cz);
  const scale = height / top;
  for (const chunk of hf.chunks.values()) for (let i = 0; i < chunk.length; i += 1) chunk[i] = Math.round(chunk[i] * scale);
  return hf;
}

test("vak opslaan en terughalen; hoogteOp tussen de punten; geen vak = plat", () => {
  const chunk = new Int16Array(65 * 65);
  chunk[0] = 100; chunk[1] = 300; chunk[65] = -200; chunk[66] = 0;
  const bytes = encodeTerrainChunk(chunk);
  assert.equal(bytes.length, TERRAIN_CHUNK_BYTES);
  assert.deepEqual(Array.from(decodeTerrainChunk(bytes)), Array.from(chunk));
  assert.equal(decodeTerrainChunk(new Uint8Array(10)), null);
  const hf = createHeightfield({ "0:0": chunk });
  assert.equal(terrainHeightAt(hf, 0, 0), 1);
  assert.equal(terrainHeightAt(hf, 0.5, 0), 2);
  assert.equal(terrainHeightAt(hf, 0.5, 0.5), (1 + 3 - 2 + 0) / 4);
  assert.equal(terrainHeightAt(hf, -10, -10), 0, "zonder vak is de grond plat");
  assert.equal(terrainChunkIsFlat(new Int16Array(65 * 65)), true);
});

test("penseel: rand is dubbel tussen vakken, 'voor'-kopie één keer per vak, gladstrijken maakt lager", () => {
  const hf = createHeightfield();
  const touched = new Set();
  const before = [];
  const changed = applyTerrainBrush(hf, { mode: "raise", x: 64, z: 64, radius: 6, strength: 1, softness: 0.5, dt: 0.1, touched,
    beforeTouch: (key, chunk) => before.push([key, chunk]) });
  assert.deepEqual(Array.from(changed).sort(), ["0:0", "0:1", "1:0", "1:1"]);
  assert.equal(before.length, 4);
  assert.ok(before.every(([, chunk]) => chunk === null), "vakken bestonden nog niet");
  const corner = terrainVertexCm(hf, 64, 64);
  assert.ok(corner > 0);
  assert.equal(hf.chunks.get("0:0")[64 * 65 + 64], corner);
  assert.equal(hf.chunks.get("1:1")[0], corner);
  assert.equal(hf.chunks.get("1:0")[64 * 65], corner);
  applyTerrainBrush(hf, { mode: "raise", x: 64, z: 64, radius: 6, strength: 1, softness: 0.5, dt: 0.1, touched, beforeTouch: (key, chunk) => before.push([key, chunk]) });
  assert.equal(before.length, 4, "tweede stap in dezelfde streek: geen nieuwe kopie");
  const peak = terrainHeightAt(hf, 64, 64);
  for (let i = 0; i < 20; i += 1) applyTerrainBrush(hf, { mode: "smooth", x: 64, z: 64, radius: 8, strength: 1, softness: 0, dt: 0.1 });
  assert.ok(terrainHeightAt(hf, 64, 64) < peak, "gladstrijken haalt de top omlaag");
  applyTerrainBrush(hf, { mode: "lower", x: 10, z: 10, radius: 3, strength: 1, softness: 0, dt: 0.1 });
  assert.ok(terrainHeightAt(hf, 10, 10) < 0, "verlagen kan onder 0");
});

test("slimme mesh: vlak = 2 driehoeken (+ rok), heuvel dichtbij fijner dan veraf", () => {
  const flat = buildTerrainChunkMesh(createHeightfield(), 0, 0, { maxError: 0.05 });
  assert.equal(flat.topTriangles, 2);
  assert.equal(flat.triangles, 2 + 8, "4 randen, elk 2 driehoeken rok");
  const hf = hillField(12, 20, 32, 32);
  const errors = terrainChunkErrors(hf.chunks.get("0:0"));
  const near = buildTerrainChunkMesh(hf, 0, 0, { maxError: 0.05, errors });
  const far = buildTerrainChunkMesh(hf, 0, 0, { maxError: 0.5, errors });
  assert.ok(near.topTriangles > far.topTriangles * 2, near.topTriangles + " > " + far.topTriangles);
  assert.ok(near.topTriangles < 8192, "nooit meer dan het volle raster");
  assert.equal(countTerrainChunkTriangles(errors, 0.05), near.topTriangles);
  // Hoogte in de mesh = hoogte van de kaart.
  for (let v = 0; v < near.positions.length / 3; v += 50) {
    const x = near.positions[v * 3]; const z = near.positions[v * 3 + 2];
    if (v * 3 < near.topTriangles * 9) assert.ok(Math.abs(near.positions[v * 3 + 1] - terrainHeightAt(hf, x, z)) < 0.011 || near.positions[v * 3 + 1] < terrainHeightAt(hf, x, z));
  }
});

test("lopen: omhoog over een zachte heuvel, te steil = muur, omlaag mag altijd", () => {
  const gentle = hillField(4, 30, 0, 0);
  const world = { ground: { width: 200, depth: 200, y: 0 }, terrain: { heightfield: { maxSlopeDeg: 50 } } };
  const index = createWalkabilityIndex(world, { heightfield: gentle });
  const start = { x: -20, y: groundHeightAt(index, -20, 0), z: 0 };
  const step = resolveMovement(start, { x: -19.5, y: start.y, z: 0 }, { index, radius: 0.5 });
  assert.ok(step.x > -20, "loopt door");
  assert.ok(Math.abs(step.y - terrainHeightAt(gentle, step.x, step.z)) < 0.001, "y = hoogte van de grond");
  // Een muur: 10 m hoog op 2 m afstand.
  const wall = createHeightfield();
  applyTerrainBrush(wall, { mode: "raise", x: 10, z: 0, radius: 3, strength: 1, softness: 0, dt: 0.25 });
  for (const chunk of wall.chunks.values()) for (let i = 0; i < chunk.length; i += 1) if (chunk[i] > 0) chunk[i] = 1000;
  const wallIndex = createWalkabilityIndex(world, { heightfield: wall });
  const blocked = resolveMovement({ x: 5, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }, { index: wallIndex, radius: 0.5 });
  assert.ok(blocked.x < 7.5, "staat stil voor de muur (x=" + blocked.x + ")");
  const down = resolveMovement({ x: 10, y: 10, z: 0 }, { x: 14, y: 10, z: 0 }, { index: wallIndex, radius: 0.5 });
  assert.ok(down.x > 13, "van de muur af lopen mag");
  const steepAllowed = createWalkabilityIndex({ ground: world.ground, terrain: { heightfield: { maxSlopeDeg: 89 } } }, { heightfield: wall });
  const climb = resolveMovement({ x: 5, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }, { index: steepAllowed, radius: 0.5 });
  assert.ok(climb.x > 8.5, "met 89 graden mag het wel");
});

test("server: vakken uit de assets, objecten en pickups op de grond, zonder terrein niets anders", () => {
  const hf = hillField(6, 25, 0, 0);
  const files = new Map();
  for (const [key, chunk] of hf.chunks) files.set("sha" + key, chunk);
  const refs = Object.fromEntries(Array.from(hf.chunks.keys()).map((key) => [key, "sha" + key]));
  const loaded = heightfieldForWorld({ terrain: { heightfield: { chunks: refs } } }, { readTerrainChunk: (sha1) => files.get(sha1) || null });
  assert.equal(loaded.chunks.size, hf.chunks.size);
  const world = {
    ground: { y: 0 },
    spawn: { x: 0, y: 0, z: 0 },
    entities: [{ id: "boom", transform: { position: { x: 0, y: 0.5, z: 0 } } }, { id: "ver", transform: { position: { x: 100, y: 0, z: 100 } } }],
    zones: { packages: [{ zoneId: "z", spawns: [{ x: 0, y: 0, z: 0 }],
      spawnControllers: [{ spawnSets: [{ spawns: [{ nodeType: "pickup_spawn", x: 1, y: 0, z: 1 }] }] }] }], byId: {} }
  };
  world.zonePackage = world.zones.packages[0];
  world.zones.byId.z = world.zones.packages[0];
  const lifted = liftWorldOntoTerrain(world, loaded);
  assert.ok(Math.abs(lifted.entities[0].transform.position.y - (0.5 + terrainHeightAt(hf, 0, 0))) < 1e-9, "boom staat 0.5 m boven de heuvel");
  assert.equal(lifted.entities[1].transform.position.y, 0, "buiten de heuvel blijft het 0");
  assert.ok(lifted.spawn.y > 5);
  assert.ok(lifted.zones.packages[0].spawnControllers[0].spawnSets[0].spawns[0].y > 5, "pickup op de heuvel");
  assert.equal(lifted.zones.byId.z, lifted.zones.packages[0], "zelfde zone blijft hetzelfde object");
  assert.equal(world.entities[0].transform.position.y, 0.5, "de builddata zelf blijft onveranderd");
  assert.equal(liftWorldOntoTerrain(world, null), world);
  const plain = buildRuntimeWorld({});
  assert.deepEqual(plain.terrain.heightfield.chunks, {});
  assert.equal(plain.terrain.heightfield.maxSlopeDeg, 50);
  const withTerrain = buildRuntimeWorld({ terrain: { chunks: refs, maxSlopeDeg: 40 } }, { assetService: { readTerrainChunk: (sha1) => files.get(sha1) || null, manifestForIds: () => [] } });
  assert.equal(withTerrain.terrain.heightfield.maxSlopeDeg, 40);
  assert.ok(withTerrain.spawn.y > 5, "startplek op de heuvel");
});

test("kaart Terrein: lijst vak → vingerafdruk wordt gecontroleerd", () => {
  const sha = "a".repeat(40);
  assert.equal(validateDocument("terrain_settings", { chunks: { "0:0": sha, "-3:12": sha }, maxSlopeDeg: 45 }).ok, true);
  assert.equal(validateDocument("terrain_settings", { chunks: { "a:b": sha } }).ok, false);
  assert.equal(validateDocument("terrain_settings", { chunks: { "0:0": "kort" } }).ok, false);
  assert.equal(validateDocument("terrain_settings", { chunks: [] }).ok, false);
  assert.equal(validateDocument("terrain_settings", { maxSlopeDeg: 95 }).ok, false);
});

test("assets: vakken bewaren op vingerafdruk en lezen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-terrein-"));
  try {
    const service = Object.create(AssetService.prototype);
    service.assetsDir = dir;
    const chunk = new Int16Array(65 * 65);
    chunk[100] = 1234;
    const saved = service.saveTerrainChunks({ "2:-1": { data: Buffer.from(encodeTerrainChunk(chunk)) } });
    assert.match(saved["2:-1"], /^[0-9a-f]{40}$/);
    assert.equal(service.readTerrainChunk(saved["2:-1"])[100], 1234);
    assert.equal(service.terrainChunkExists(saved["2:-1"]), true);
    assert.equal(service.readTerrainChunk("../../etc/passwd"), null);
    assert.throws(() => service.saveTerrainChunks({ "2:-1": { data: Buffer.alloc(10) } }), /grootte/);
    assert.throws(() => service.saveTerrainChunks({ "x": { data: Buffer.from(encodeTerrainChunk(chunk)) } }), /Onbekend/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("muis op de heuvel: straal raakt de heuvel, niet het platte vlak eronder", () => {
  const hf = hillField(10, 20, 0, 0);
  const hit = raycastTerrain(hf, { x: -60, y: 20, z: 0 }, (() => { const d = { x: 60, y: -20, z: 0 }; const l = Math.hypot(d.x, d.y, d.z); return { x: d.x / l, y: d.y / l, z: d.z / l }; })(), { groundY: 0 });
  assert.ok(hit, "raakt");
  assert.ok(hit.x < 0 && hit.y > 0.5, "raakt de voorkant van de heuvel (x=" + hit.x.toFixed(2) + ", y=" + hit.y.toFixed(2) + ")");
  assert.ok(Math.abs(hit.y - terrainHeightAt(hf, hit.x, hit.z)) < 0.05);
});
