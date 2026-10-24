// F2-E1-T01: de movementkernel draait zonder Three.js en geeft dezelfde uitkomst als de oude route.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import * as kernel from "../apps/web/public/shared/movement-kernel.js";
import * as runtime from "../apps/web/public/shared/world-runtime.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function staticImportGraph(entry) {
  const seen = new Set();
  const bare = new Set();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(file, "utf8");
    const re = /(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
    let match;
    while ((match = re.exec(text))) {
      const spec = (match[1] || match[2]).split("?")[0];
      if (spec.startsWith(".")) queue.push(path.resolve(path.dirname(file), spec));
      else bare.add(spec);
    }
  }
  return { files: [...seen], bare: [...bare] };
}

function seeded(seed) {
  let s = seed;
  return function () {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test("server-importgraph bevat geen Three.js", function () {
  const graph = staticImportGraph(path.join(rootDir, "src/server/server.js"));
  const threeImports = graph.bare.filter((spec) => spec === "three" || spec.startsWith("three/"));
  assert.deepEqual(threeImports, []);
  assert.ok(graph.files.some((file) => file.endsWith("movement-kernel.js")), "server gebruikt de movementkernel");
  assert.ok(!graph.files.some((file) => file.endsWith("world-runtime.js")), "server laadt world-runtime.js niet meer");
});

test("world-runtime gebruikt dezelfde kernelfuncties (een waarheid)", function () {
  assert.equal(runtime.resolveMovement, kernel.resolveMovement);
  assert.equal(runtime.createWalkabilityIndex, kernel.createWalkabilityIndex);
  assert.equal(runtime.solidCollisionEntriesForWorld, kernel.solidCollisionEntriesForWorld);
});

test("earcut-triangulatie is gelijk aan THREE.ShapeUtils voor 1000 polygonen", function () {
  const rnd = seeded(11);
  for (let i = 0; i < 1000; i++) {
    const count = 3 + Math.floor(rnd() * 8);
    const points = [];
    for (let p = 0; p < count; p++) {
      const angle = (p / count) * Math.PI * 2;
      const radius = 5 + rnd() * 20;
      points.push({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius });
    }
    if (i % 7 === 0) points.push({ x: points[0].x, y: 0, z: points[0].z });
    const contour = points.map((point) => new THREE.Vector2(point.x, point.z));
    const expected = THREE.ShapeUtils.triangulateShape(contour, [])
      .map((t) => kernel.makeCollisionTriangle(points[t[0]], points[t[1]], points[t[2]]))
      .filter(Boolean);
    const actual = kernel.triangulateWalkableSurfaceEarClip(points);
    assert.deepEqual(actual, expected, "polygoon " + i);
  }
});

test("1000 random bewegingen: kernel en world-runtime binnen 1 mm, deterministisch", function () {
  const world = {
    ground: { x: 0, z: 0, width: 200, depth: 200, y: 0 },
    terrain: {
      surfaces: [
        { id: "w", kind: "walkable", walkable: true, points: [{ x: -20, z: -20 }, { x: 30, z: -25 }, { x: 40, z: 10 }, { x: 5, z: 35 }, { x: -25, z: 15 }] },
        { id: "b", kind: "water", blocksMovement: true, points: [{ x: 50, z: 50 }, { x: 70, z: 50 }, { x: 70, z: 70 }, { x: 50, z: 70 }] }
      ]
    },
    collision: { blockers: [{ id: "r1", shape: "rectangle", x: 10, z: 10, width: 6, depth: 3, rotationY: 30 }] },
    entities: [{ id: "tree", solid: true, collisionRadius: 1.2, transform: { position: { x: -5, z: 5 } } }]
  };
  const indexA = kernel.createWalkabilityIndex(world);
  const indexB = runtime.createWalkabilityIndex(world);
  const solids = kernel.solidCollisionEntriesForWorld(world);
  const rnd = seeded(7);
  for (let i = 0; i < 1000; i++) {
    const start = { x: rnd() * 160 - 80, y: 0, z: rnd() * 160 - 80 };
    const desired = { x: start.x + rnd() * 20 - 10, y: 0, z: start.z + rnd() * 20 - 10 };
    const a = kernel.resolveMovement(start, desired, { index: indexA, solids, radius: 0.4 });
    const b = runtime.resolveMovement(start, desired, { index: indexB, solids, radius: 0.4 });
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) <= 0.001, "vector " + i);
    assert.ok(Math.abs((a.y || 0) - (b.y || 0)) <= 0.001, "hoogte " + i);
  }
});
