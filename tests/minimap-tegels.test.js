import test from "node:test";
import assert from "node:assert/strict";
import { minimapTileSignatures } from "../apps/web/public/shared/minimap-tile-sigs.js";

// Kevin 24-11: BAKE maakt alleen tegels opnieuw waar iets veranderd is.
const tiles = [];
for (let tz = 0; tz < 4; tz += 1) for (let tx = 0; tx < 4; tx += 1) tiles.push({ key: "0:" + tx + ":" + tz, minX: tx * 32, maxX: (tx + 1) * 32, minZ: tz * 32, maxZ: (tz + 1) * 32 });
tiles.push({ key: "1:0:0", minX: 0, maxX: 64, minZ: 0, maxZ: 64 }, { key: "1:1:1", minX: 64, maxX: 128, minZ: 64, maxZ: 128 });
const tree = (x, z) => ({ id: "boom", type: "model", modelAssetId: "boom", collisionRadius: 0.5, transform: { position: { x, y: 0, z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } });
const changed = (a, b) => Object.keys(a).filter((key) => a[key] !== b[key]).sort();

test("een boom verplaatsen: alleen de tegels bij de oude en nieuwe plek (en de laag erboven)", () => {
  const before = minimapTileSignatures({ world: { ground: { y: 0 }, entities: [tree(16, 16)] }, tiles });
  const same = minimapTileSignatures({ world: { ground: { y: 0 }, entities: [tree(16, 16)] }, tiles });
  assert.deepEqual(changed(before, same), [], "niets veranderd = niets opnieuw");
  const after = minimapTileSignatures({ world: { ground: { y: 0 }, entities: [tree(18, 16)] }, tiles });
  assert.deepEqual(changed(before, after), ["0:0:0", "1:0:0"]);
  const far = minimapTileSignatures({ world: { ground: { y: 0 }, entities: [tree(16, 16), tree(110, 110)] }, tiles });
  assert.deepEqual(changed(before, far), ["0:3:3", "1:1:1"]);
});

test("terrein per vak van 64 m; licht of lucht anders = alles opnieuw", () => {
  const chunk = new Int16Array(65 * 65);
  const base = { world: { ground: { y: 0 } }, heightChunks: new Map([["0:0", chunk]]), tiles };
  const before = minimapTileSignatures(base);
  const raised = chunk.slice(); raised[100] = 50;
  const after = minimapTileSignatures(Object.assign({}, base, { heightChunks: new Map([["0:0", raised]]) }));
  const hit = changed(before, after);
  assert.ok(hit.includes("0:0:0") && hit.includes("0:1:1") && hit.includes("1:0:0"), "het vak van 64 m");
  assert.ok(!hit.includes("0:3:3") && !hit.includes("0:3:0"), "verder weg blijft staan");
  const sky = minimapTileSignatures(Object.assign({}, base, { world: { ground: { y: 0 }, sky: { sunElevation: 30 } } }));
  assert.equal(changed(before, sky).length, tiles.length);
});
