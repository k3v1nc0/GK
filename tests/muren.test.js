// Kevin 23-11: 🧱 Muur in de Area tool: een kamer met punten, per rand Muur, Deur, Raam of Open; zichtbaar en dicht.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { areaBodyFromNodePatch, areaNodeValues } from "../src/shared/authoring/kinds/area.js";
import { compileAreaShapes } from "../src/server/authoring/area-compiler.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { editWallEdges, wallBlockers, wallEdgeKinds, wallFromAreaValues, wallPieces } from "../apps/web/public/shared/walls.js";
import { isPointBlockedByBlocker, createWalkabilityIndex } from "../apps/web/public/shared/movement-kernel.js";

// Kamer van 4 x 4 m. Rand 0 = voorkant (z = 0), rand 1 = rechts, rand 2 = achter, rand 3 = links.
const room = (settings) => ({ areaId: "muur.huis", displayName: "Huis", soort: "muur", shape: "polygon",
  pointsMm: [[0, 0], [4000, 0], [4000, 4000], [0, 4000]], ...(settings ? { settings } : {}) });

test("muur-vlak is geldig, met randen per soort; een verkeerde randlijst niet", () => {
  assert.equal(validateDocument("area", room({ wallHeight: 3, wallThickness: 0.3, doorEdges: [0], windowEdges: [1] })).ok, true);
  assert.equal(validateDocument("area", room({ doorEdges: ["x"] })).ok, false);
  assert.equal(validateDocument("area", room({ wallHeight: 500 })).ok, false, "hoogte binnen min/max");
});

test("deur, raam en open: de juiste stukken en botsing", () => {
  const wall = wallFromAreaValues("muur.huis", areaNodeValues(room({ doorEdges: [0], windowEdges: [1], openEdges: [2], wallHeight: 3 }), "muur.huis"));
  assert.deepEqual(wall.edges, ["door", "window", "open", "wall"]);
  const pieces = wallPieces(wall);
  assert.equal(pieces.filter((piece) => piece.edge === 0).length, 1, "deur: alleen de muur boven de deur");
  assert.equal(pieces.filter((piece) => piece.edge === 1).length, 2, "raam: onder en boven het raam");
  assert.equal(pieces.filter((piece) => piece.edge === 2).length, 0, "open: niets");
  const blockers = wallBlockers(wall);
  assert.deepEqual(blockers.map((blocker) => blocker.id).sort(), ["muur.huis::muur1", "muur.huis::muur3"], "muur en raam dicht, deur en open niet");
  const index = createWalkabilityIndex({ collision: { blockers } });
  assert.equal(isPointBlockedByBlocker(index, 0, 2, 0.3), true, "tegen de linker muur");
  assert.equal(isPointBlockedByBlocker(index, 2, 0, 0.3), false, "door de deur");
  assert.equal(isPointBlockedByBlocker(index, 2, 2, 0.3), false, "midden in de kamer");
});

test("Randen kiezen en punten erbij: de soorten schuiven mee", () => {
  const patch = editWallEdges(4, {}, [0, 2], "door");
  assert.deepEqual(patch, { doorEdges: [0, 2], windowEdges: null, openEdges: null });
  const back = editWallEdges(4, { doorEdges: [0, 2] }, [2], "wall");
  assert.deepEqual(back.doorEdges, [0]);
  // Een punt erbij midden op rand 1: de deur op rand 2 wordt rand 3.
  const body = room({ doorEdges: [2] });
  const points = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
  const next = areaBodyFromNodePatch(body, { points });
  assert.deepEqual(next.settings.doorEdges, [3]);
  assert.deepEqual(wallEdgeKinds(5, next.settings), ["wall", "wall", "wall", "door", "wall"]);
});

test("de build zet de muur in de wereld (zichtbaar) en bij de blockers (dicht)", () => {
  const doc = { docKey: "area:muur.huis", kind: "area", archived: false, body: room({ windowEdges: [1] }) };
  const compiled = compileAreaShapes([doc]);
  assert.deepEqual(compiled.errors, []);
  const base = { gameProject: { zones: {} }, collision: { blockers: [], walkableSurfaces: [] }, terrain: {}, entities: [] };
  const world = applyCanonicalBuild(base, { data: compiled.server });
  assert.equal(world.walls.length, 1);
  assert.equal(world.walls[0].id, "area.muur.huis");
  assert.equal(world.collision.blockers.filter((blocker) => blocker.reason === "wall").length, 4, "vier randen dicht (ook het raam)");
  const editor = applyCanonicalBuild(base, { data: compiled.server }, { editor: true });
  assert.equal(editor.walls[0].id, "doc:area:muur.huis", "in de editor klik je de muur aan");
});
