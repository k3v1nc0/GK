import test from "node:test";
import assert from "node:assert/strict";
import { buildWalkabilityIndex, groundHeightAt, resolveMovement, resolveMovementCandidateInto } from "../apps/web/public/shared/movement-kernel.js";
import { findPlayerPath } from "../apps/web/public/shared/player-navigation.js";
import { createPlayerPathClient } from "../apps/web/public/shared/player-path-client.js";
import { createHeightfield, TERRAIN_CHUNK_VERTS } from "../apps/web/public/shared/terrain.js";

const ground = { width: 40, depth: 50, y: 0 };
const bridge = (z, closedEdges = [0, 2]) => ({ id: "bridge" + z, y: 1, closedEdges,
  points: [{ x: -5, y: 1, z }, { x: 5, y: 1, z }, { x: 5, y: 1, z: z + 3 }, { x: -5, y: 1, z: z + 3 }] });
function river(bridges = [bridge(7), bridge(-21)]) {
  return buildWalkabilityIndex({ ground, terrain: { water: [{ id: "river", x: 0, z: 0, width: 8, depth: 100, height: 1, behavior: "block" }] },
    collision: { walkableSurfaces: bridges } });
}

test("schuine brugrand: links/rechts glijden met volledige loop- en rensnelheid", () => {
  const index = buildWalkabilityIndex({ ground });
  index.walls = [{ ax: -20, az: -20, ay: 0, bx: 20, bz: 20, by: 0, minX: -20, maxX: 20, minZ: -20, maxZ: 20 }];
  for (const step of [0.15, 0.24]) for (const direction of [-1, 1]) {
    let position = { x: 0.4, y: 0, z: -0.4 };
    for (let tick = 0; tick < 30; tick += 1) {
      const dx = direction === 1 ? 0.2 : -1;
      const dz = direction === 1 ? 1 : -0.2;
      const length = Math.hypot(dx, dz);
      const next = resolveMovement(position, { x: position.x + dx / length * step, y: 0, z: position.z + dz / length * step }, { index, radius: 0.4 });
      assert.ok(Math.hypot(next.x - position.x, next.z - position.z) >= step * 0.98, "geen snelheidsverlies langs de rand");
      assert.ok(next.x - next.z >= Math.SQRT2 * 0.4 - 0.001, "blijft aan dezelfde kant");
      position = next;
    }
    assert.ok(direction * (position.x + position.z) > 2, "glijdt naar de gekozen kant");
  }
});

test("ronde wateroever: blijven lopen zonder in het water te komen", () => {
  const chunk = new Int16Array(TERRAIN_CHUNK_VERTS ** 2);
  for (let z = 0; z < TERRAIN_CHUNK_VERTS; z += 1) for (let x = 0; x < TERRAIN_CHUNK_VERTS; x += 1) {
    chunk[z * TERRAIN_CHUNK_VERTS + x] = Math.round(Math.min(0, Math.hypot(x - 32, z - 32) - 12) * 100);
  }
  const index = buildWalkabilityIndex({ ground: { minX: 0, maxX: 64, minZ: 0, maxZ: 64, boundsMode: "explicitBounds", width: 64, depth: 64, y: 0 },
    terrain: { water: [{ id: "lake", x: 32, z: 32, width: 30, depth: 30, height: -0.5, behavior: "block" }] }
  }, { heightfield: createHeightfield(new Map([["0:0", chunk]])) });
  let position = { x: 32, y: 0, z: 19.95 };
  for (let tick = 0; tick < 90; tick += 1) {
    const nx = (position.x - 32) / Math.hypot(position.x - 32, position.z - 32);
    const nz = (position.z - 32) / Math.hypot(position.x - 32, position.z - 32);
    const dx = -nx * 0.8 - nz * 0.6;
    const dz = -nz * 0.8 + nx * 0.6;
    const next = resolveMovement(position, { x: position.x + dx * 0.16, y: position.y, z: position.z + dz * 0.16 }, { index, radius: 0.4 });
    assert.ok(Math.hypot(next.x - position.x, next.z - position.z) > 0.155, "blijft op snelheid");
    assert.ok(next.y >= -0.52, "blijft boven de waterlijn");
    position = next;
  }
  assert.ok(position.x > 40, "de ronde oever gevolgd");
});

test("klik aan overkant kiest de kortere brug en respecteert gesloten zijkanten", () => {
  const index = river();
  const start = { x: -10, y: 0, z: 0 };
  const goal = { x: 10, z: 0 };
  const route = findPlayerPath(start, goal, { index, radius: 0.4 });
  assert.equal(route.ok, true, route.reason);
  assert.ok(route.points.some((point) => point.z > 7), "gaat via de brug");
  assert.ok(route.points.every((point) => point.z > -5), "kiest de nabijere brug");
  let position = start;
  let travelled = 0;
  const result = {};
  for (const target of route.points) {
    const distance = Math.hypot(target.x - position.x, target.z - position.z);
    const from = position;
    const steps = Math.ceil(distance / 0.1);
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + (target.x - from.x) * step / steps;
      const z = from.z + (target.z - from.z) * step / steps;
      assert.equal(resolveMovementCandidateInto(result, position.x, position.y, position.z, x, position.y, z, index, index.ground, [], 0.4), true, "hele route is begaanbaar");
      position = { ...result };
    }
    travelled += distance;
  }
  assert.ok(travelled < 35, "korte route zonder onnodige omweg: " + travelled);
  assert.ok(Math.hypot(position.x - goal.x, position.z - goal.z) < 0.01);
});

test("afgeronde rand (Lopen en botsen): klik aan de overkant loopt via de brug, ook na kopie naar de routewerker (3-11)", () => {
  const waterWalk = { edgeRound: true, edgeDistance: 0.7, edgeSmooth: 1.5, edgeSteep: true, waterBlockDepth: 0.02, edgeCell: 0.5 };
  const original = buildWalkabilityIndex({ ground, terrain: { waterWalk, water: [{ id: "river", x: 0, z: 0, width: 8, depth: 100, height: 1, behavior: "block" }] },
    collision: { walkableSurfaces: [bridge(7), bridge(-21)] } });
  assert.ok(original.edgeField, "rand staat aan");
  // De routewerker krijgt een kopie (postMessage): die moet kunnen, en de rand komt daar terug.
  const copy = structuredClone(original);
  for (const index of [original, copy]) {
    const route = findPlayerPath({ x: -10, y: 0, z: 0 }, { x: 10, z: 0 }, { index, radius: 0.4 });
    assert.equal(route.ok, true, route.reason);
    assert.ok(route.points.some((point) => point.z > 7), "gaat via de brug");
  }
  // Klik vlak aan de waterkant aan de overkant (binnen de rand): hij loopt naar de plek net erbuiten.
  const edgeClick = findPlayerPath({ x: -10, y: 0, z: 0 }, { x: 4.3, z: 0 }, { index: original, radius: 0.4 });
  assert.equal(edgeClick.ok, true, edgeClick.reason);
  assert.ok(edgeClick.points.at(-1).x > 4.5, "eindpunt net buiten de rand");
});

test("dichte brug en waterbestemming leveren geen onveilige route", () => {
  const index = river([bridge(7, [0, 1, 2, 3])]);
  const start = { x: -10, y: 0, z: 0 };
  assert.equal(findPlayerPath(start, { x: 10, z: 0 }, { index, radius: 0.4 }).ok, false);
  assert.equal(findPlayerPath(start, { x: 0, z: 0 }, { index, radius: 0.4 }).reason, "goal_blocked");
});

test("vrije grond: directe route zonder zoeken en zonder extra snelheid", () => {
  const index = buildWalkabilityIndex({ ground });
  const route = findPlayerPath({ x: -10, y: 0, z: 0 }, { x: 10, z: 0 }, { index });
  assert.equal(route.direct, true);
  assert.equal(route.expanded, 0);
  const start = { x: 0, y: groundHeightAt(index, 0, 0), z: 0 };
  const moved = resolveMovement(start, { x: 0.3, y: 0, z: 0.4 }, { index });
  assert.ok(Math.abs(Math.hypot(moved.x, moved.z) - 0.5) < 0.0001);
});

test("een NPC aanklikken blijft mogelijk: de route stopt naast zijn botsobject", () => {
  const index = buildWalkabilityIndex({ ground });
  const route = findPlayerPath({ x: -10, y: 0, z: 0 }, { x: 0, z: 0 }, {
    index, radius: 0.4, solids: [{ x: 0, z: 0, radius: 1, enabled: true }]
  });
  assert.equal(route.ok, true);
  const end = route.points.at(-1);
  assert.ok(Math.hypot(end.x, end.z) >= 1.4);
  assert.ok(Math.hypot(end.x, end.z) < 2, "dichtbij genoeg om te praten");
});

test("brug op twee kilometer afstand wordt via de brugpunten gevonden zonder groot raster", () => {
  const index = buildWalkabilityIndex({ ground: { width: 160, depth: 4000, y: 0 },
    terrain: { water: [{ id: "river", x: 0, z: 0, width: 8, depth: 5000, height: 1, behavior: "block" }] },
    collision: { walkableSurfaces: [bridge(1200)] } });
  const route = findPlayerPath({ x: -25, y: 0, z: -800 }, { x: 25, z: -800 }, { index, radius: 0.4 });
  assert.equal(route.ok, true, route.reason);
  assert.ok(route.points.some(p => p.z >= 1200));
  assert.ok(route.expanded < 40, "alleen het kleine brugnetwerk doorzoeken");
  assert.ok(route.checks < 200000, "beperkt aantal botsingscontroles bij verre brug");
});

test("NPC op geblokkeerde plek: bereikbare plek binnen praatbereik gebruiken", () => {
  const index = river([]);
  const route = findPlayerPath({ x: -10, y: 0, z: 0 }, { x: -3, z: 0 }, { index, radius: 0.4, arrivalRadius: 3 });
  assert.equal(route.ok, true, route.reason);
  assert.ok(Math.hypot(route.points.at(-1).x + 3, route.points.at(-1).z) <= 3.001);
  assert.ok(route.points.at(-1).x < -4.4, "blijft op de oever");
});

test("routewerker hergebruikt wereldgegevens en annuleert oude klikken", async () => {
  const workers = [];
  const client = createPlayerPathClient(() => {
    const worker = { messages: [], terminated: false,
      postMessage(message) { this.messages.push(message); },
      terminate() { this.terminated = true; },
      reply(route) { this.onmessage({ data: { id: this.messages.at(-1).id, route } }); }
    };
    workers.push(worker);
    return worker;
  });
  const context = { index: river(), solids: [], radius: 0.4 };
  const start = { x: -10, y: 0, z: 0 }, goal = { x: 10, z: 0 };
  const first = client.findPath(start, goal, context);
  workers[0].reply({ ok: true, points: [goal] });
  assert.equal((await first).ok, true);
  const second = client.findPath(start, goal, context);
  assert.equal(workers[0].messages[1].context, undefined, "wereld slechts eenmaal kopiëren");
  const third = client.findPath(start, goal, context);
  assert.equal((await second).reason, "cancelled");
  assert.equal(workers[0].terminated, true);
  workers[0].reply({ ok: true, points: [{ x: 999, z: 999 }] });
  workers[1].reply({ ok: true, points: [goal] });
  assert.deepEqual((await third).points, [goal], "oud antwoord verandert de nieuwe route niet");
  client.destroy();
  assert.equal(workers[1].terminated, true);
});
