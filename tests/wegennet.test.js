// Wegennet (8-11): 🛣️ Weg-lijnen vormen samen één netwerk; klikken om te lopen (en de NPC die vooruitloopt) gaat erover.
import test from "node:test";
import assert from "node:assert/strict";
import { buildWalkabilityIndex } from "../apps/web/public/shared/movement-kernel.js";
import { findPlayerPath } from "../apps/web/public/shared/player-navigation.js";
import { nextPlayerRouteWaypoint } from "../apps/web/public/shared/player-path-client.js";
import { buildRoadGraph, planRoadRoute, roadGraphMarkers } from "../apps/web/public/shared/road-network.js";
import { createNavigator } from "../src/server/runtime/navigation.js";
import { waterWalkValues } from "../src/shared/authoring/kinds/water-walk.js";

test("netwerk: gedeelde punten, T-splitsing en kruising worden knooppunten", () => {
  const graph = buildRoadGraph([
    { id: "hoofdweg", points: [{ x: 0, z: 0 }, { x: 100, z: 0 }] },
    { id: "zijweg", points: [{ x: 50, z: 0.3 }, { x: 50, z: 60 }] },
    { id: "kruis", points: [{ x: 20, z: -20 }, { x: 30, z: 20 }] },
    { id: "verder", points: [{ x: 100.2, z: 0.1 }, { x: 140, z: 0 }] }
  ]);
  const markers = roadGraphMarkers(graph);
  const junctions = markers.filter((marker) => marker.kind === "junction");
  assert.equal(junctions.length, 2, "T-splitsing (50,0) en kruising (25,0)");
  assert.ok(junctions.some((marker) => Math.abs(marker.x - 25) < 0.01 && Math.abs(marker.z) < 0.01));
  assert.ok(!markers.some((marker) => marker.kind === "end" && Math.abs(marker.x - 100) < 1), "aan elkaar geklikt = geen los eind");
  assert.equal(markers.filter((marker) => marker.kind === "end").length, 5);
  const plan = planRoadRoute(graph, { x: 2, z: 10 }, { x: 52, z: 58 }, { offroadWeight: 2 });
  assert.deepEqual(plan.points.map((p) => [Math.round(p.x), Math.round(p.z)]), [[2, 0], [25, 0], [50, 0], [50, 58]],
    "op de weg naast je (niet terug naar het begin), over de T-splitsing, eraf bij het doel");
});

const ground = { width: 240, depth: 240, y: 0 };
const roads = [{ id: "weg", points: [{ x: -80, z: -80 }, { x: -80, z: 60 }, { x: 80, z: 60 }] }];

test("route volgen hervat zodra de speler dicht genoeg bij het tussenpunt op de weg is", () => {
  const route = [{ x: -80, z: -50 }, { x: -80, z: 10 }, { x: 20, z: 10 }];
  const next = nextPlayerRouteWaypoint(route, { x: -79.9, z: -50.05 }, 0.15);
  assert.deepEqual(next, { x: -80, z: 10 });
  assert.equal(route.length, 2, "het bereikte aanlooppunt is verwijderd en de wegroute gaat verder");
});

test("klikken: ver weg gaat via de weg, dichtbij en zonder weg recht erop af", () => {
  const index = buildWalkabilityIndex({ ground, terrain: { roads } });
  const start = { x: -70, y: 0, z: -50 }, goal = { x: 75, z: 55 };
  const route = findPlayerPath(start, goal, { index, radius: 0.5, roads: true });
  assert.equal(route.ok, true);
  assert.equal(route.road, true);
  assert.ok(route.points.some((p) => Math.hypot(p.x + 80, p.z - 60) < 4), "langs de bocht van de weg");
  assert.ok(!route.points.some((p) => Math.hypot(p.x + 80, p.z - 60) < 1), "de bocht is afgerond (niet scherp door de hoek)");
  assert.ok(Math.hypot(route.points[0].x + 80, route.points[0].z + 50) < 5, "eerst naar de weg");
  const last = route.points[route.points.length - 1];
  assert.ok(Math.hypot(last.x - goal.x, last.z - goal.z) < 0.01, "eindigt op het doel");
  const plain = findPlayerPath(start, goal, { index, radius: 0.5 });
  assert.equal(plain.points.length, 1, "zonder roads (vijanden): recht erop af");
  const near = findPlayerPath(start, { x: -60, z: -40 }, { index, radius: 0.5, roads: true });
  assert.equal(near.road, undefined, "korter dan 20 m: geen weg");
});

test("instellingen: voorkeur 1 = alleen als de weg echt korter is; boom op de weg = er omheen", () => {
  const settings = waterWalkValues({ roadPreference: 1, roadMinDistance: 10 });
  assert.equal(settings.roadPreference, 1);
  const index = buildWalkabilityIndex({ ground, terrain: { roads, waterWalk: settings } });
  assert.equal(index.roadMinDistance, 10);
  const route = findPlayerPath({ x: -70, y: 0, z: -50 }, { x: 75, z: 55 }, { index, radius: 0.5, roads: true });
  assert.equal(route.road, undefined, "zonder voorkeur is recht door het veld korter");
  const tree = { id: "boom", x: -80, z: 0, radius: 1.2 };
  const withTree = findPlayerPath({ x: -70, y: 0, z: -50 }, { x: 75, z: 55 },
    { index: buildWalkabilityIndex({ ground, terrain: { roads } }), radius: 0.5, roads: true, solids: [tree] });
  assert.equal(withTree.ok, true);
  assert.equal(withTree.road, true);
  for (let i = 1; i < withTree.points.length; i += 1) {
    const a = withTree.points[i - 1], b = withTree.points[i];
    for (let k = 0; k <= 20; k += 1) {
      const x = a.x + (b.x - a.x) * k / 20, z = a.z + (b.z - a.z) * k / 20;
      assert.ok(Math.hypot(x - tree.x, z - tree.z) >= tree.radius + 0.5 - 0.01, "loopt om de boom heen");
    }
  }
});

test("Kevin 8-11: NPC naast je in het gras = gewoon erheen lopen, niet eerst naar de weg", () => {
  const index = buildWalkabilityIndex({ ground, terrain: { roads, waterWalk: waterWalkValues({ roadMinDistance: 50 }) } });
  const npc = { id: "npc", x: -62, z: -50, radius: 0.6 };
  const route = findPlayerPath({ x: -70, y: 0, z: -50 }, { x: npc.x, z: npc.z }, { index, radius: 0.5, roads: true, solids: [npc], arrivalRadius: 2 });
  assert.equal(route.ok, true, route.reason);
  assert.notEqual(route.road, true, "binnen 'Weg pas vanaf' niet via de weg, ook al staat de NPC zelf in de rechte lijn");
  assert.ok(!route.points.some((p) => Math.abs(p.x + 80) < 2), "komt niet bij de weg (x = -80)");
});

test("klik aan de overkant van water gebruikt ook dichtbij de veilige weg over de brug", () => {
  const bridgeRoad = [{ id: "brugweg", points: [{ x: -8, z: 0 }, { x: -8, z: 21.5 }, { x: 8, z: 21.5 }, { x: 8, z: 0 }] }];
  const bridge = { id: "brug", y: 1, closedEdges: [0, 2],
    points: [{ x: -5, y: 1, z: 20 }, { x: 5, y: 1, z: 20 }, { x: 5, y: 1, z: 23 }, { x: -5, y: 1, z: 23 }] };
  const index = buildWalkabilityIndex({ ground: { width: 80, depth: 80, y: 0 },
    terrain: { roads: bridgeRoad, water: [{ id: "rivier", x: 0, z: 0, width: 8, depth: 100, height: 1, behavior: "block" }] },
    collision: { walkableSurfaces: [bridge] } });
  const route = findPlayerPath({ x: -8, y: 0, z: 0 }, { x: 8, z: 0 }, { index, radius: 0.4, roads: true });
  assert.equal(route.ok, true, route.reason);
  assert.equal(route.road, true, "geblokkeerd door water: ook binnen 20 m eerst de weg gebruiken");
  assert.ok(route.points.some((point) => point.z >= 20 && point.x > -5 && point.x < 5), "de weg gaat over de brug");
});

test("server: de NPC die vooruitloopt kan dezelfde weg nemen", () => {
  const navigator = createNavigator({ index: buildWalkabilityIndex({ ground, terrain: { roads } }), radius: 0.5 });
  const route = navigator.findPath({ x: -70, y: 0, z: -50 }, { x: 75, z: 55 }, { maxExpanded: 16000, maxChecks: 60000, roads: true });
  assert.equal(route.ok, true);
  assert.equal(route.road, true);
  const enemy = navigator.findPath({ x: -70, y: 0, z: -50 }, { x: 75, z: 55 });
  assert.equal(enemy.road, undefined, "vijanden negeren de weg");
});

test("Weg bewerken: punt + lijn, vastmaken, samenvoegen, T op een lijn, weghalen, kopiëren", async () => {
  const { roadAddPoint, roadConnect, roadMerge, roadSplitLink, roadDelete, roadDuplicate, roadClip, roadPaste, roadParts, roundRoadCorners } = await import("../apps/web/public/shared/road-network.js");
  let net = { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], links: [[0, 1]] };
  let step = roadAddPoint(net, { x: 50, z: 50 });
  assert.equal(roadParts(step.net), 2, "los punt in the middle of nowhere = apart deel");
  step = roadAddPoint(step.net, { x: 50, z: 60 }, step.index);
  assert.deepEqual(step.net.links, [[0, 1], [2, 3]], "F met één punt gekozen: nieuw punt met lijn");
  net = roadConnect(step.net, [1, 2]).net;
  assert.equal(roadParts(net), 1, "twee punten + F = vast, één netwerk");
  const t = roadSplitLink(net, 0, { x: 5, z: 0 });
  net = roadAddPoint(t.net, { x: 5, z: -20 }, t.index).net;
  assert.equal(net.links.filter((link) => link.includes(t.index)).length, 3, "T-splitsing: drie lijnen aan één punt");
  const merged = roadMerge(net, 5, 0);
  assert.equal(merged.net.points.length, net.points.length - 1);
  assert.ok(merged.net.links.every(([a, b]) => a !== b && a < merged.net.points.length && b < merged.net.points.length));
  const gone = roadDelete(net, [], [0]);
  assert.equal(gone.links.length, net.links.length - 1, "alleen de lijn weg, de punten blijven");
  assert.equal(gone.points.length, net.points.length);
  const copy = roadDuplicate(net, [2, 3], { x: 100, z: 0 });
  assert.equal(copy.net.points.length, net.points.length + 2);
  assert.deepEqual(copy.net.links.slice(-1), [[copy.indices[0], copy.indices[1]]], "de lijn tussen de gekopieerde punten gaat mee");
  const pasted = roadPaste(net, roadClip(net, [2, 3]), { x: 0, z: 200 });
  assert.equal(Math.round(pasted.net.points[pasted.indices[0]].z), 195);
  const bend = roundRoadCorners([{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }], 4);
  assert.ok(!bend.some((p) => Math.hypot(p.x - 20, p.z) < 1), "de hoek wordt een bocht");
  assert.deepEqual(roundRoadCorners([{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 20 }], 0).length, 3, "0 = scherp");
});
