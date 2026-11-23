// Kevin 23-11: 🧱 Muur in de Area tool: een kamer met punten, per rand Muur, Deur, Raam of Open; zichtbaar en dicht.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { areaBodyFromNodePatch, areaNodeValues } from "../src/shared/authoring/kinds/area.js";
import { compileAreaShapes } from "../src/server/authoring/area-compiler.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { editWallEdges, wallBlockers, wallEdgeKinds, wallFromAreaValues, wallNetLinks, wallPieces, wallWindows } from "../apps/web/public/shared/walls.js";
import { roadChainOrder, roadDelete, roadInsertChain, roadSplitLink } from "../apps/web/public/shared/road-network.js";
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
  assert.deepEqual(wall.links.map((link) => link.kind), ["door", "window", "open", "wall"], "oude muur = ring met de soorten uit de lijsten");
  const pieces = wallPieces(wall);
  assert.equal(pieces.filter((piece) => piece.edge === 0).length, 1, "deur: alleen de muur boven de deur");
  assert.equal(pieces.filter((piece) => piece.edge === 1).length, 1, "raam: dicht stuk (het licht komt van het raam-vlak)");
  assert.equal(wallWindows(wall).length, 1, "één raam");
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

test("muur als net: T-splitsing, soort per lijn, geldig en het raam schijnt naar binnen", () => {
  // Kamer 4 x 4 met een tussenmuur van (2,0) naar (2,4): punt 4 = (2,0) op de onderrand, punt 5 = (2,4) op de bovenrand.
  const body = {
    areaId: "muur.huis", soort: "muur", shape: "polygon", displayName: "Huis",
    pointsMm: [[0, 0], [4000, 0], [4000, 4000], [0, 4000], [2000, 0], [2000, 4000]],
    links: [[0, 4], [4, 1], [1, 2, 2], [2, 5], [5, 3], [3, 0, 1], [4, 5]]
  };
  const check = validateDocument("area", body);
  assert.equal(check.ok, true, "net met soort per lijn is geldig: " + JSON.stringify(check.issues || check));
  assert.equal(validateDocument("area", Object.assign({}, body, { links: [[0, 1, 7]] })).ok, false, "onbekende soort is fout");
  assert.equal(validateDocument("area", { areaId: "weg.a", soort: "pad", shape: "polygon", pointsMm: [[0, 0], [1000, 0]], links: [[0, 1, 1]] }).ok, false, "een weg heeft geen soort per lijn");
  const wall = wallFromAreaValues("muur.huis", areaNodeValues(body, "muur.huis"));
  assert.deepEqual(wall.links.map((link) => link.kind), ["wall", "wall", "window", "wall", "wall", "door", "wall"]);
  const pieces = wallPieces(wall);
  // De tussenmuur loopt aan beide kanten een halve dikte door (tot in de buitenmuur): de T is dicht.
  const middle = pieces.find((piece) => piece.edge === 6);
  assert.ok(Math.abs(middle.az - -0.15) < 1e-6 && Math.abs(middle.bz - 4.15) < 1e-6, "tussenmuur sluit aan");
  const blockers = wallBlockers(wall);
  const index = createWalkabilityIndex({ collision: { blockers } });
  assert.equal(isPointBlockedByBlocker(index, 2, 2, 0.3), true, "tegen de tussenmuur");
  assert.equal(isPointBlockedByBlocker(index, 0, 2, 0.3), false, "door de deur (links)");
  assert.equal(isPointBlockedByBlocker(index, 4, 2, 0.3), true, "raam is dicht");
  const [win] = wallWindows(wall);
  assert.ok(win.nx < 0 && Math.abs(win.nz) < 1e-6, "raam in de rechtermuur schijnt naar links (de kamer in)");
  // Bewerken: punt in de raam-lijn zetten en een lijn weghalen houdt de soort.
  const net = { points: body.pointsMm.map((p) => ({ x: p[0] / 1000, z: p[1] / 1000 })), links: wallNetLinks(6, body.links) };
  const split = roadSplitLink(net, 2, { x: 4, z: 2 });
  assert.deepEqual(split.net.links.slice(-2), [[1, 6, 2], [6, 2, 2]], "beide helften blijven raam");
  const removed = roadDelete(split.net, [], [0]);
  assert.ok(removed.links.some((link) => link[2] === 1), "deur blijft deur");
  // Textuur passen: hele hoogte (links-rechts herhalen) of overal herhalen; een andere keuze is fout.
  const tall = Object.assign({}, body, { settings: { wallTextureFit: "height" } });
  assert.equal(validateDocument("area", tall).ok, true);
  assert.equal(wallFromAreaValues("muur.huis", areaNodeValues(tall, "muur.huis")).textureFit, "height");
  assert.equal(wall.textureFit, "tile", "standaard overal herhalen");
  assert.equal(validateDocument("area", Object.assign({}, body, { settings: { wallTextureFit: "raar" } })).ok, false);
  // Bovenkant-textuur gaat mee naar de muur (leeg = donker bij hele hoogte, in de runtime).
  assert.equal(wallFromAreaValues("muur.huis", areaNodeValues(Object.assign({}, body, { settings: { wallTopTextureAssetId: "steen" } }), "muur.huis")).topTextureAssetId, "steen");
  assert.equal(wall.topTextureAssetId, null);
  // Ctrl+V van een gekopieerd raam: in de lijn, midden op de plek, even breed; schuine kopie wordt recht; te kort = niets.
  const line = { points: [{ x: 0, z: 0 }, { x: 10, z: 0 }], links: [[0, 1]] };
  const raam = { points: [{ x: 0, z: 0 }, { x: 0.6, z: 1.04 }], links: [[0, 1, 2]] };
  const put = roadInsertChain(line, 0, { x: 3, z: 1 }, raam);
  assert.deepEqual(put.net.links, [[0, 2], [2, 3, 2], [3, 1]]);
  assert.ok(Math.abs(put.net.points[2].x - 2.4) < 0.01 && Math.abs(put.net.points[3].x - 3.6) < 0.01 && put.net.points[3].z === 0);
  assert.deepEqual(put.links, [1]);
  // Twee helften (muur + raam) in een rij gaan ook; een L-vorm niet.
  const rij = { points: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 2, z: 0 }], links: [[0, 1], [1, 2, 2]] };
  assert.equal(roadInsertChain(line, 0, { x: 5, z: 0 }, rij).net.links.length, 4);
  assert.equal(roadChainOrder({ points: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }], links: [[0, 1], [1, 2]] }), null);
  assert.equal(roadInsertChain(line, 0, { x: 3, z: 0 }, { points: [{ x: 0, z: 0 }, { x: 20, z: 0 }], links: [[0, 1, 2]] }), null);
  // Een oude muur zonder lijnen is een gesloten ring.
  assert.deepEqual(wallNetLinks(4, undefined, { openEdges: [3] }), [[0, 1], [1, 2], [2, 3], [3, 0, 3]]);
});
