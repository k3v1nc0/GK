// Ombouw stap 2: één Area tool. Vlakken zijn documenten en de wereld tekent ze met de oude read-models.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { areaBodyFromNodePatch, areaNodeValues } from "../src/shared/authoring/kinds/area.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { planDomain } from "../src/server/authoring/legacy-import.js";
import { areaShapeReadModels } from "../src/server/publish-service.js";
import { defaultValuesForType } from "../apps/web/public/shared/node-types.js";

const pad = { areaId: "pad.dorp", displayName: "Dorpspad", soort: "pad", shape: "polygon", pointsMm: [[0, 0], [10000, 0], [10000, 5000]], settings: { width: 4 } };
const doc = (body, extra = {}) => Object.assign({ docKey: "area:" + body.areaId, kind: "area", body, archived: false, revision: 1 }, extra);

test("een pad, blokkade en deelgebied volgen hun eigen regels", () => {
  assert.equal(validateDocument("area", pad).ok, true);
  const blokkade = validateDocument("area", { areaId: "b.rots", displayName: "Rots", soort: "blokkade", pointsMm: [[0, 0], [1000, 0]] });
  assert.equal(blokkade.ok, false, "een blokkade heeft 3 punten nodig");
  const badSetting = validateDocument("area", Object.assign({}, pad, { settings: { width: -5 } }));
  assert.equal(badSetting.ok, false);
  const regionOnly = validateDocument("area", Object.assign({}, pad, { safe: true }));
  assert.equal(regionOnly.ok, false, "veilig hoort alleen bij een deelgebied");
  const loopvlak = validateDocument("area", { areaId: "l.brug", displayName: "Brug", soort: "loopvlak", pointsMm: [[0, 0, 500], [2000, 0, 500], [2000, 3000, 500]] });
  assert.equal(loopvlak.ok, true);
  const oudDeelgebied = validateDocument("area", { areaId: "a.dorp", displayName: "Dorp", regionRef: "region:r.weide", shape: "box", minXMm: 0, maxXMm: 1000, minZMm: 0, maxZMm: 1000 });
  assert.equal(oudDeelgebied.ok, true, "een Fase 04-deelgebied zonder soort blijft geldig");
});

test("puntengereedschap schrijft punten en instellingen terug in het document", () => {
  const values = areaNodeValues(pad, "doc:area:pad.dorp");
  assert.equal(values.surfaceId, "doc:area:pad.dorp");
  assert.equal(values.width, 4);
  assert.deepEqual(values.points[1], { x: 10, z: 0 });
  const next = areaBodyFromNodePatch(pad, { points: [{ x: 1, z: 2 }, { x: 3.0004, z: 4 }], width: 6, surfaceId: "x" });
  assert.deepEqual(next.pointsMm, [[1000, 2000], [3000, 4000]]);
  assert.equal(next.settings.width, 6);
  assert.equal(next.surfaceId, undefined, "afgeleide velden gaan niet in het document");
});

test("build en wereld: een verhuisd pad vervangt zijn node-versie; de editor ziet het document", () => {
  const imported = doc(pad, { legacyRef: "areas:surface_layer:surface_main" });
  const compiled = compileCanonical([imported]);
  assert.deepEqual(compiled.errors, []);
  const data = JSON.parse(compiled.files["server.json"].text);
  assert.equal(data.areaShapes.length, 1);
  const world = { gameProject: { zones: {} }, terrain: { surfaces: [{ id: "surface_main", width: 3 }, { id: "ander_pad" }] }, collision: { blockers: [], walkableSurfaces: [] }, entities: [], scatterAreas: [] };
  const game = applyCanonicalBuild(world, { buildId: "b", data });
  assert.deepEqual(game.terrain.surfaces.map((surface) => surface.id).sort(), ["ander_pad", "surface_main"]);
  assert.equal(game.terrain.surfaces.find((surface) => surface.id === "surface_main").width, 4);
  const editor = applyCanonicalBuild(world, { buildId: "b", data }, { editor: true });
  assert.deepEqual(editor.terrain.surfaces.map((surface) => surface.id).sort(), ["ander_pad", "doc:area:pad.dorp"]);
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
  assert.equal(plan.create.find((entry) => entry.legacyRef === "areas:surface_layer:pad_oud").body.settings.width, 5);
  assert.equal(plan.diffCount, 0, JSON.stringify(plan.parity.filter((entry) => entry.diffs.length)));
});
