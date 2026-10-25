// Fase 04 (F4-E1-T01): eenheden, Cells en grenzen. Pure functies; geen DB.
import assert from "node:assert/strict";
import test from "node:test";
import {
  CELL_SIZE_MM, cellIndex, cellKeyForPointMm, cellKeysForRect, convertLegacyPoint, createSpatialIndex,
  metersToMm, mmToMeters, parseCellKey, polygonProblem, rectContains, rectsOverlap, resolveMembership, areaContains
} from "../apps/web/public/shared/spatial.js";
import { cellFor } from "../src/server/runtime/interest.js";

test("spatial: -1/0/grensvectoren en negatieve Cells", function () {
  assert.equal(cellIndex(0), 0);
  assert.equal(cellIndex(-1), -1);
  assert.equal(cellIndex(CELL_SIZE_MM - 1), 0);
  assert.equal(cellIndex(CELL_SIZE_MM), 1);
  assert.equal(cellIndex(-CELL_SIZE_MM), -1);
  assert.equal(cellIndex(-CELL_SIZE_MM - 1), -2);
  assert.equal(cellKeyForPointMm(-1, 0), "-1_0");
  assert.deepEqual(parseCellKey("-3_12"), { cx: -3, cz: 12 });
  assert.equal(parseCellKey("a_b"), null);
  // Half-open: max-rand hoort er niet bij, min-rand wel.
  const rect = { minXMm: -1000, maxXMm: 1000, minZMm: 0, maxZMm: 1000 };
  assert.equal(rectContains(rect, -1000, 0), true);
  assert.equal(rectContains(rect, 1000, 0), false);
  assert.equal(rectContains(rect, 999, 999), true);
  // Gedeelde rand is geen overlap.
  assert.equal(rectsOverlap({ minXMm: 0, maxXMm: 10, minZMm: 0, maxZMm: 10 }, { minXMm: 10, maxXMm: 20, minZMm: 0, maxZMm: 10 }), false);
  assert.equal(rectsOverlap({ minXMm: 0, maxXMm: 10, minZMm: 0, maxZMm: 10 }, { minXMm: 9, maxXMm: 20, minZMm: 0, maxZMm: 10 }), true);
  // Een rect dat precies op een Cellgrens eindigt, raakt de volgende Cell niet.
  assert.deepEqual(cellKeysForRect({ minXMm: -CELL_SIZE_MM, maxXMm: CELL_SIZE_MM, minZMm: 0, maxZMm: 1 }), ["-1_0", "0_0"]);
  assert.equal(cellKeysForRect({ minXMm: 0, maxXMm: CELL_SIZE_MM * 100, minZMm: 0, maxZMm: CELL_SIZE_MM * 100 }), null, "te groot = null");
});

test("spatial: legacy-posities binnen 1 mm na round-trip, onbekende schaal blokkeert, geen dubbele conversie", function () {
  for (const value of [0, -0.0004, 12.3456, -987.654321, 99999.9995, -64, 64]) {
    const mm = metersToMm(value);
    assert.ok(Number.isInteger(mm));
    assert.ok(Math.abs(mmToMeters(mm) - value) <= 0.001, "binnen 1 mm: " + value);
    // Nog een keer omzetten verandert niets: mm -> m -> mm is stabiel.
    assert.equal(metersToMm(mmToMeters(mm)), mm);
  }
  assert.deepEqual(convertLegacyPoint({ x: 1.5, z: -2 }), { xMm: 1500, zMm: -2000 });
  assert.throws(() => convertLegacyPoint({ x: 1, z: 1 }, 0), { code: "SCALE_UNKNOWN" });
  assert.throws(() => convertLegacyPoint({ x: 1, z: 1 }, NaN), { code: "SCALE_UNKNOWN" });
});

test("spatial: AOI (interest.js, meters) en Cells (mm) gebruiken hetzelfde 64 m-grid", function () {
  for (let i = 0; i < 1000; i += 1) {
    const x = Math.round((Math.sin(i * 12.9898) * 43758.5453 % 1) * 2000000) / 1000; // mm-precisie, ook negatief
    const z = Math.round((Math.cos(i * 78.233) * 12345.6789 % 1) * 2000000) / 1000;
    const aoi = cellFor(x, z, 64);
    assert.equal(cellKeyForPointMm(metersToMm(x), metersToMm(z)), aoi.cx + "_" + aoi.cz, "punt " + x + "," + z);
  }
});

test("spatial: polygoonregels en vormen", function () {
  assert.equal(polygonProblem([[0, 0], [10, 0], [0, 10]]), null);
  assert.equal(polygonProblem([[0, 0], [10, 0]]), "POLYGON_TOO_FEW_POINTS");
  assert.equal(polygonProblem([[0, 0], [10, 0], [20, 0]]), "POLYGON_NO_AREA");
  assert.equal(polygonProblem([[0, 0], [10, 10], [10, 0], [0, 10]]), "POLYGON_SELF_INTERSECTS");
  assert.equal(polygonProblem([[0, 0], [0, 0], [10, 0], [0, 10]]), "POLYGON_DUPLICATE_POINT");
  const circle = { shape: "cylinder", centerXMm: 0, centerZMm: 0, radiusMm: 5000 };
  assert.equal(areaContains(circle, 4999, 0), true);
  assert.equal(areaContains(circle, 5000, 0), false);
  assert.equal(areaContains(circle, 5400, 0, 500), true, "hysteresis");
  const tri = { shape: "polygon", pointsMm: [[0, 0], [10000, 0], [0, 10000]] };
  assert.equal(areaContains(tri, 1000, 1000), true);
  assert.equal(areaContains(tri, 9000, 9000), false);
  assert.equal(areaContains(tri, 5200, 5200, 500), true, "binnen 0,5 m van de rand");
});

function sampleWorld() {
  return {
    regions: [
      { regionId: "region.west", displayName: "West", minXMm: -50000, maxXMm: 0, minZMm: -50000, maxZMm: 50000 },
      { regionId: "region.oost", displayName: "Oost", minXMm: 0, maxXMm: 50000, minZMm: -50000, maxZMm: 50000 }
    ],
    areas: [
      { areaId: "area.plein", regionId: "region.oost", shape: "box", minXMm: 10000, maxXMm: 30000, minZMm: -10000, maxZMm: 10000 },
      { areaId: "area.fontein", regionId: "region.oost", shape: "cylinder", centerXMm: 20000, centerZMm: 0, radiusMm: 3000, priority: 5 }
    ],
    cells: { "-1_-1": { regions: ["region.west"], areas: [] }, "-1_0": { regions: ["region.west"], areas: [] }, "0_-1": { regions: ["region.oost"], areas: ["area.fontein", "area.plein"] }, "0_0": { regions: ["region.oost"], areas: ["area.fontein", "area.plein"] } }
  };
}

test("spatial: membership met gedeelde rand, prioriteit en hysteresis", function () {
  const index = createSpatialIndex(sampleWorld());
  assert.equal(resolveMembership(index, -1, 0).regionId, "region.west");
  assert.equal(resolveMembership(index, 0, 0).regionId, "region.oost", "rand x=0 hoort bij oost (half-open)");
  assert.equal(resolveMembership(index, 15000, 0).areaId, "area.plein");
  assert.equal(resolveMembership(index, 20000, 0).areaId, "area.fontein", "hogere prioriteit wint");
  assert.equal(resolveMembership(index, 90000, 0).regionId, null, "buiten alles");
  // Hysteresis: net over de rand blijft de speler in de vorige Region.
  const prev = { regionId: "region.west", areaId: null };
  assert.equal(resolveMembership(index, 300, 0, prev).regionId, "region.west");
  assert.equal(resolveMembership(index, 600, 0, prev).regionId, "region.oost");
  // Area-hysteresis: net buiten het plein blijft het plein.
  const inPlein = { regionId: "region.oost", areaId: "area.plein" };
  assert.equal(resolveMembership(index, 30200, 0, inPlein).areaId, "area.plein");
  assert.equal(resolveMembership(index, 31000, 0, inPlein).areaId, null);
  // Heen en weer over de grens geeft geen flikkering zolang je binnen 0,5 m blijft.
  let state = { regionId: "region.west", areaId: null };
  const seen = new Set();
  for (const x of [-200, 100, 400, -100, 300, -400]) { state = resolveMembership(index, x, 0, state); seen.add(state.regionId); }
  assert.deepEqual(Array.from(seen), ["region.west"]);
});
