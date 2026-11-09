// Ombouw stap 2: één Area tool. Vlakken zijn documenten en de wereld tekent ze met de oude read-models.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { areaBodyFromNodePatch, areaNodeValues, convertAreaSoort } from "../src/shared/authoring/kinds/area.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { planDomain } from "../src/server/authoring/legacy-import.js";
import { areaShapeReadModels } from "../src/server/publish-service.js";
import { defaultValuesForType } from "../apps/web/public/shared/node-types.js";

const pad = { areaId: "pad.dorp", displayName: "Dorpspad", soort: "pad", shape: "polygon", pointsMm: [[0, 0], [10000, 0], [10000, 5000]], settings: { width: 4 } };
const blokkadeOk = { areaId: "b.ok", displayName: "Rots", soort: "blokkade", pointsMm: [[0, 0], [1000, 0], [1000, 1000]] };
const doc = (body, extra = {}) => Object.assign({ docKey: "area:" + body.areaId, kind: "area", body, archived: false, revision: 1 }, extra);

test("een pad, blokkade en deelgebied volgen hun eigen regels", () => {
  assert.equal(validateDocument("area", pad).ok, true);
  const blokkade = validateDocument("area", { areaId: "b.rots", displayName: "Rots", soort: "blokkade", pointsMm: [[0, 0], [1000, 0]] });
  assert.equal(blokkade.ok, false, "een blokkade heeft 3 punten nodig");
  const badSetting = validateDocument("area", Object.assign({}, blokkadeOk, { settings: { reason: "onzin" } }));
  assert.equal(badSetting.ok, false);
  const oudPad = validateDocument("area", Object.assign({}, pad, { settings: { width: -5, textureAssetId: "weg" } }));
  assert.equal(oudPad.ok, true, "een weg negeert oude textuur-instellingen van een pad");
  const regionOnly = validateDocument("area", Object.assign({}, pad, { safe: true }));
  assert.equal(regionOnly.ok, false, "veilig hoort alleen bij een deelgebied");
  const loopvlak = validateDocument("area", { areaId: "l.brug", displayName: "Brug", soort: "loopvlak", pointsMm: [[0, 0, 500], [2000, 0, 500], [2000, 3000, 500]] });
  assert.equal(loopvlak.ok, true);
  const oudDeelgebied = validateDocument("area", { areaId: "a.dorp", displayName: "Dorp", regionRef: "region:r.weide", shape: "box", minXMm: 0, maxXMm: 1000, minZMm: 0, maxZMm: 1000 });
  assert.equal(oudDeelgebied.ok, true, "een Fase 04-deelgebied zonder soort blijft geldig");
});

test("een Weg kan niet naar een ander vlaktype worden omgezet", () => {
  assert.deepEqual(convertAreaSoort(pad, "begroeiing"), pad);
  assert.equal(convertAreaSoort(blokkadeOk, "begroeiing").soort, "begroeiing", "gewone vlakken blijven wel omzetbaar");
});

test("puntengereedschap schrijft punten en instellingen terug in het document", () => {
  const values = areaNodeValues(pad, "doc:area:pad.dorp");
  assert.equal(values.surfaceId, "doc:area:pad.dorp");
  assert.deepEqual(values.points[1], { x: 10, z: 0 });
  const next = areaBodyFromNodePatch(pad, { points: [{ x: 1, z: 2 }, { x: 3.0004, z: 4 }], width: 6, surfaceId: "x" });
  assert.deepEqual(next.pointsMm, [[1000, 2000], [3000, 4000]]);
  assert.equal(next.settings, undefined, "een weg heeft geen instellingen meer (oude textuur weg)");
  assert.equal(next.surfaceId, undefined, "afgeleide velden gaan niet in het document");
  const rots = areaBodyFromNodePatch(blokkadeOk, { reason: "wall" });
  assert.equal(rots.settings.reason, "wall");
});

test("build en wereld: een verhuisd pad vervangt zijn node-versie; de editor ziet het document", () => {
  const imported = doc(pad, { legacyRef: "areas:surface_layer:surface_main" });
  const compiled = compileCanonical([imported]);
  assert.deepEqual(compiled.errors, []);
  const data = JSON.parse(compiled.files["server.json"].text);
  assert.equal(data.areaShapes.length, 1);
  const world = { gameProject: { zones: {} }, terrain: { surfaces: [{ id: "surface_main", width: 3 }, { id: "ander_pad" }] }, collision: { blockers: [], walkableSurfaces: [] }, entities: [], scatterAreas: [] };
  const game = applyCanonicalBuild(world, { buildId: "b", data });
  assert.deepEqual(game.terrain.surfaces.map((surface) => surface.id), ["ander_pad"], "een weg is in de game niet te zien");
  assert.deepEqual(game.terrain.roads, [{ id: "surface_main#0", points: [{ x: 0, z: 0 }, { x: 10, z: 0 }] }, { id: "surface_main#1", points: [{ x: 10, z: 0 }, { x: 10, z: 5 }] }],
    "een oude weg zonder lijnen = punten op een rij; één stukje per lijn");
  const editor = applyCanonicalBuild(world, { buildId: "b", data }, { editor: true });
  assert.deepEqual(editor.terrain.surfaces.map((surface) => surface.id), ["ander_pad"], "de editor tekent de Weg zelf (alleen punten en lijnen)");
  assert.deepEqual(editor.terrain.roads.map((road) => road.id), ["doc:area:pad.dorp#0", "doc:area:pad.dorp#1"]);
  const net = Object.assign({}, pad, { pointsMm: [[0, 0], [10000, 0], [5000, 8000], [5000, -8000]], links: [[0, 1], [2, 3]] });
  assert.equal(validateDocument("area", net).ok, true, "een weg met eigen lijnen (kruising)");
  assert.equal(validateDocument("area", Object.assign({}, net, { links: [[0, 9]] })).ok, false, "lijn naar een punt dat er niet is");
  assert.equal(validateDocument("area", Object.assign({}, blokkadeOk, { links: [[0, 1]] })).ok, false, "lijnen horen alleen bij een weg");
  const crossing = JSON.parse(compileCanonical([doc(net)]).files["server.json"].text);
  assert.equal(applyCanonicalBuild(world, { buildId: "b", data: crossing }).terrain.roads.length, 2);
  const archived = applyCanonicalBuild(world, { buildId: "b", data: JSON.parse(compileCanonical([Object.assign({}, imported, { archived: true })]).files["server.json"].text) });
  assert.deepEqual(archived.terrain.surfaces.map((surface) => surface.id), ["ander_pad"], "gearchiveerd = weg uit de wereld");
});

test("verhuizen: oude vlak-nodes worden documenten zonder verschil in de wereld", () => {
  const surface = Object.assign(defaultValuesForType("surface_layer"), { surfaceId: "pad_oud", label: "Oud pad", width: 5, points: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 6 }] });
  const blocker = Object.assign(defaultValuesForType("blocker_area"), { blockerId: "rots_1", label: "Rots", shapeType: "box", x: 2, z: 3, width: 4, depth: 2, points: [] });
  const loose = Object.assign(defaultValuesForType("blocker_area"), { blockerId: "los", label: "Los", points: [{ x: 0, z: 0 }, { x: 1, z: 0 }, { x: 1, z: 1 }] });
  const graph = { nodes: [
    { id: "n_pad", type: "surface_layer", values: surface },
    { id: "n_rots", type: "blocker_area", values: blocker },
    { id: "n_los", type: "blocker_area", values: loose }
  ] };
  const models = areaShapeReadModels([{ id: "n_pad", nodeType: "surface_layer", values: surface }, { id: "n_rots", nodeType: "blocker_area", values: Object.assign({}, blocker, { shapeType: "polygon", points: [{ x: 0, z: 2 }, { x: 4, z: 2 }, { x: 4, z: 4 }, { x: 0, z: 4 }] }) }]);
  const world = { gameProject: { zones: {} }, terrain: { surfaces: models.surfaces }, collision: { blockers: models.blockers, walkableSurfaces: [] }, entities: [], scatterAreas: [] };
  const plan = planDomain(world, "areas", [], {}, { graph });
  assert.deepEqual(plan.blocking, []);
  assert.equal(plan.create.length, 3);
  assert.equal(plan.create.find((entry) => entry.legacyRef === "areas:blocker_area:los").archived, true, "niet aangesloten = gearchiveerd mee");
  assert.equal(plan.create.find((entry) => entry.legacyRef === "areas:surface_layer:pad_oud").body.settings, undefined, "een oud pad wordt een weg zonder instellingen");
  assert.equal(plan.diffCount, 0, JSON.stringify(plan.parity.filter((entry) => entry.diffs.length)));
});
