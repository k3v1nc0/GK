import test from "node:test";
import assert from "node:assert/strict";
import { readModelCollision, transformModelCollision } from "../src/server/model-collision.js";
import { isPolygonBlockedAtRadius, pushAwayFromSolids, solidCollisionEntriesForWorld } from "../apps/web/public/shared/movement-kernel.js";

function diamondGlb() {
  const positions = new Float32Array([0, 0, -2, 2, 0, 0, 0, 0, 2, -2, 0, 0]);
  let json = JSON.stringify({ scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, translation: [3, 0, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: "VEC3" }], bufferViews: [{ buffer: 0, byteLength: positions.byteLength }] });
  json = json.padEnd(Math.ceil(json.length / 4) * 4, " ");
  const data = Buffer.alloc(28 + json.length + positions.byteLength);
  data.write("glTF"); data.writeUInt32LE(2, 4); data.writeUInt32LE(data.length, 8);
  data.writeUInt32LE(json.length, 12); data.write("JSON", 16); data.write(json, 20);
  data.writeUInt32LE(positions.byteLength, 20 + json.length); data.writeUInt32LE(0x004e4942, 24 + json.length);
  Buffer.from(positions.buffer).copy(data, 28 + json.length);
  return data;
}

test("GLB contour volgt de mesh en lokale nodes, niet de rechthoek", () => {
  const shape = readModelCollision(diamondGlb());
  assert.ok(shape.points.length >= 3 && shape.points.length <= 16);
  assert.equal(isPolygonBlockedAtRadius(shape.points, 3, 0, 0), true);
  assert.equal(isPolygonBlockedAtRadius(shape.points, 4.8, 1.8, 0), false);
  assert.equal(isPolygonBlockedAtRadius(shape.points, 4.9, 0, 0.1), true);
});

test("schaal, draaiing en verplaatsing werken door in gedeelde botsing", () => {
  const shape = readModelCollision(diamondGlb());
  const points = transformModelCollision(shape, { position: { x: 10, z: 20 }, rotation: { y: 90 }, scale: { x: 2, y: 2, z: 2 } });
  const world = { entities: [{ id: "placed.castle", solid: true, collisionRadius: 0.1, collisionPoints: points, transform: { position: { x: 10, z: 20 } } }] };
  const solids = solidCollisionEntriesForWorld(world);
  const point = { x: 10, y: 0, z: 14 };
  pushAwayFromSolids(point, 0.5, solids);
  assert.equal(isPolygonBlockedAtRadius(points, point.x, point.z, 0.49), false);
  const distant = { x: 100, z: 100 };
  pushAwayFromSolids(distant, 0.5, solids);
  assert.deepEqual(distant, { x: 100, z: 100 });
});

test("rand, spiegeling en uitschakelen van botsing", () => {
  for (const scaleX of [1, -1]) {
    const points = transformModelCollision(readModelCollision(diamondGlb()), { scale: { x: scaleX } });
    const point = { ...points[0] };
    pushAwayFromSolids(point, 0.5, [{ points }]);
    assert.equal(isPolygonBlockedAtRadius(points, point.x, point.z, 0.49), false);
    const disabled = { x: 3 * scaleX, z: 0 };
    pushAwayFromSolids(disabled, 0.5, [{ points, enabled: false }]);
    assert.equal(disabled.x, 3 * scaleX);
  }
});
