// Loopvlak met dichte randen (onzichtbare muur), bijv. de zijkanten van een brug.
import test from "node:test";
import assert from "node:assert/strict";
import { buildWalkabilityIndex, resolveMovement } from "../apps/web/public/shared/movement-kernel.js";
import { areaBodyFromNodePatch, areaSettingsIssues, remapClosedEdges } from "../apps/web/public/shared/area-soorten.js";

// Brug van x -5 tot 5, z -1 tot 1, op 1 m hoogte. Punten: links-voor, rechts-voor, rechts-achter, links-achter.
// Rand 0 = voorkant (z -1), rand 2 = achterkant (z 1): die zijn dicht. Uiteinden (rand 1 en 3) open.
const bridge = (closedEdges) => ({
  ground: { width: 100, depth: 100, y: 0, minX: -50, maxX: 50, minZ: -50, maxZ: 50, boundsMode: "centerSize" },
  collision: { blockers: [], walkableSurfaces: [{ id: "brug", x: 0, y: 1, z: 0, width: 10, depth: 2, priority: 10, closedEdges,
    points: [{ x: -5, y: 1, z: -1 }, { x: 5, y: 1, z: -1 }, { x: 5, y: 1, z: 1 }, { x: -5, y: 1, z: 1 }] }] }
});
const walk = (world, from, to) => resolveMovement(from, to, { index: buildWalkabilityIndex(world), radius: 0.4 });

test("dichte rand houdt je op de brug, open rand niet", () => {
  const open = walk(bridge([]), { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -3 });
  assert.ok(open.z < -2, "zonder dichte rand loop je eraf (" + JSON.stringify(open) + ")");
  const closed = walk(bridge([0, 2]), { x: 0, y: 1, z: 0 }, { x: 0, y: 1, z: -3 });
  assert.ok(closed.z > -1 && closed.z < -0.3, "dichte rand houdt je tegen (" + JSON.stringify(closed) + ")");
  const slide = walk(bridge([0, 2]), { x: 0, y: 1, z: -0.6 }, { x: 2, y: 1, z: -2 });
  assert.ok(slide.x > 1.5 && slide.z > -1, "langs de rand glijden (" + JSON.stringify(slide) + ")");
  const end = walk(bridge([0, 2]), { x: 3, y: 1, z: 0 }, { x: 8, y: 1, z: 0 });
  assert.ok(end.x > 7, "uiteinde open: je loopt de brug af (" + JSON.stringify(end) + ")");
  const side = walk(bridge([0, 2]), { x: 0, y: 0, z: 3 }, { x: 0, y: 0, z: 0 });
  assert.ok(side.z > 1, "van opzij kom je er ook niet op (" + JSON.stringify(side) + ")");
});

test("dichte randen schuiven mee met punten erbij of eraf", () => {
  const four = [[0, 0], [10, 0], [10, 2], [0, 2]];
  assert.deepEqual(remapClosedEdges(four, [[0, 0], [5, 0], [10, 0], [10, 2], [0, 2]], [0, 2]), [0, 1, 3], "punt in rand 0: beide helften dicht");
  assert.deepEqual(remapClosedEdges(four, [[0, 0], [10, 2], [0, 2]], [1]), [0], "punt weg: samengevoegde rand dicht");
  assert.deepEqual(remapClosedEdges(four, [[1, 0], [10, 0], [10, 2], [0, 2]], [0, 3]), [0, 3], "slepen: zelfde nummers");
  const body = { areaId: "brug", displayName: "Brug", soort: "loopvlak", shape: "polygon", pointsMm: [[0, 0, 0], [10, 0, 0], [10, 2, 0], [0, 2, 0]] };
  const withEdges = areaBodyFromNodePatch(body, { closedEdges: [0, 2] });
  assert.deepEqual(withEdges.settings.closedEdges, [0, 2]);
  assert.deepEqual(areaSettingsIssues("loopvlak", withEdges.settings), []);
  assert.ok(areaSettingsIssues("loopvlak", { closedEdges: [1, 1] }).length, "dubbel mag niet");
  assert.equal(areaBodyFromNodePatch(withEdges, { closedEdges: [] }).settings, undefined, "leeg = weg");
});
