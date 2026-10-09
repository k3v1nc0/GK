import assert from "node:assert/strict";
import test from "node:test";
import { resolveMovement } from "../apps/web/public/shared/world-runtime.js";
import { solidCollisionEntriesForWorld } from "../src/server/mmo-service.js";

test("authoritative movement uses published solid model colliders", function () {
  const solids = solidCollisionEntriesForWorld({
    entities: [
      {
        id: "tent",
        solid: true,
        walkable: false,
        collisionRadius: 3.5,
        transform: { position: { x: 0, z: 0 } }
      },
      {
        id: "decoration",
        solid: false,
        collisionRadius: 10,
        transform: { position: { x: 20, z: 20 } }
      }
    ]
  });

  assert.deepEqual(solids, [{
    id: "tent::solid",
    entityId: "tent",
    x: 0,
    z: 0,
    radius: 3.5,
    enabled: true
  }]);

  const resolved = resolveMovement(
    { x: 0, y: 0, z: -5 },
    { x: 0, y: 0, z: 0 },
    { radius: 0.5, solids: solids }
  );
  assert.ok(resolved.z < -3.99, "server movement stops at the same solid radius as the client");
});
