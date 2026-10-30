// Wereld tekenen ronde 2: PNG, Afvlakken en Scherpe rand, stempels, verf (4 per vak), kaarten en server.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyTerrainBrush, applyTerrainPaint, applyTerrainStamp, createHeightfield, createPaintfield, sampleTerrainRegion,
  terrainHeightAt, terrainPaintAt, terrainPaintFromPng, terrainPaintIsEmpty, tidyPaintChunk, TERRAIN_PAINT_BYTES
} from "../apps/web/public/shared/terrain.js";
import { decodePng, encodePng, pngToHeights } from "../apps/web/public/shared/png.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { AssetService } from "../src/server/asset-service.js";

test("PNG: 16-bit grijs en 8-bit RGB blijven exact; hoogteplaatje 0..1", async () => {
  const grey = new Uint16Array([0, 1, 65535, 32768, 1234, 40000]);
  const bytes = await encodePng({ width: 3, height: 2, channels: 1, bitDepth: 16, data: grey });
  const back = await decodePng(bytes);
  assert.equal(back.bitDepth, 16);
  assert.deepEqual(Array.from(back.data), Array.from(grey));
  const heights = pngToHeights(back);
  assert.equal(heights.data[2], 1);
  assert.equal(heights.data[0], 0);
  const rgb = new Uint8Array(129 * 129 * 3);
  rgb[5] = 200;
  rgb[rgb.length - 1] = 7;
  const paint = terrainPaintFromPng(await decodePng(await encodePng({ width: 129, height: 129, channels: 3, bitDepth: 8, data: rgb })));
  assert.equal(paint.length, TERRAIN_PAINT_BYTES);
  assert.equal(paint[5], 200);
  assert.equal(paint[paint.length - 1], 7);
  await assert.rejects(decodePng(new Uint8Array([1, 2, 3])), /PNG/);
});

test("Afvlakken trekt naar de beginhoogte, Scherpe rand maakt een harde stap", () => {
  const hf = createHeightfield();
  for (let i = 0; i < 40; i += 1) applyTerrainBrush(hf, { mode: "raise", x: 0, z: 0, radius: 12, strength: 1, softness: 0.6, dt: 0.05 });
  const top = terrainHeightAt(hf, 0, 0);
  assert.ok(top > 5);
  for (let i = 0; i < 60; i += 1) applyTerrainBrush(hf, { mode: "flatten", target: 2, x: 0, z: 0, radius: 6, strength: 1, softness: 0, dt: 0.05 });
  assert.ok(Math.abs(terrainHeightAt(hf, 0, 0) - 2) < 0.05, "midden is plat op 2 m");
  assert.ok(Math.abs(terrainHeightAt(hf, 3, 2) - 2) < 0.05);
  const flat = createHeightfield();
  for (let i = 0; i < 10; i += 1) applyTerrainBrush(flat, { mode: "edge", target: 3, x: 0, z: 0, radius: 8, strength: 1, softness: 1, dt: 0.05 });
  assert.ok(Math.abs(terrainHeightAt(flat, 0, 0) - 3) < 0.02);
  assert.ok(Math.abs(terrainHeightAt(flat, 7, 0) - 3) < 0.02, "binnen de cirkel: ook 3 m (geen zachte rand)");
  assert.equal(terrainHeightAt(flat, 8, 0), 0, "net buiten: plat");
  assert.equal(applyTerrainBrush(flat, { mode: "flatten", x: 0, z: 0, radius: 4, strength: 1, dt: 0.05 }).size, 0, "zonder doel niets");
});

test("stempel: optellen, hoogste en vervangen; draaien; gebied opslaan als stempel", () => {
  const image = { width: 3, height: 3, data: new Float32Array([0, 0, 0, 0, 1, 0, 0, 0, 0]) };
  const hf = createHeightfield();
  const touched = new Set();
  const changed = applyTerrainStamp(hf, { image, x: 10, z: 10, size: 20, height: 10, edge: 0, touched, beforeTouch: () => {} });
  assert.ok(changed.size >= 1 && touched.size >= 1);
  assert.ok(Math.abs(terrainHeightAt(hf, 10, 10) - 10) < 0.02, "midden 10 m");
  assert.ok(Math.abs(terrainHeightAt(hf, 15, 10) - 5) < 0.1, "halverwege half zo hoog");
  applyTerrainStamp(hf, { image, x: 10, z: 10, size: 20, height: 10, edge: 0, blend: "add" });
  assert.ok(Math.abs(terrainHeightAt(hf, 10, 10) - 20) < 0.03, "optellen = 20 m");
  applyTerrainStamp(hf, { image, x: 10, z: 10, size: 20, height: 12, edge: 0, blend: "max" });
  assert.ok(Math.abs(terrainHeightAt(hf, 10, 10) - 20) < 0.03, "hoogste houdt 20 m");
  applyTerrainStamp(hf, { image, x: 10, z: 10, size: 20, height: 4, edge: 0, blend: "replace" });
  assert.ok(Math.abs(terrainHeightAt(hf, 10, 10) - 4) < 0.03, "vervangen = 4 m");
  const bar = { width: 4, height: 2, data: new Float32Array(8).fill(1) };
  const turned = createHeightfield();
  applyTerrainStamp(turned, { image: bar, x: 0, z: 0, size: 20, height: 5, edge: 0, rotation: 90 });
  assert.ok(terrainHeightAt(turned, 0, 8) > 4.9, "gedraaid: lang in z");
  assert.equal(terrainHeightAt(turned, 8, 0), 0, "gedraaid: smal in x");
  const region = sampleTerrainRegion(hf, 0, 0, 20, 20);
  assert.equal(region.width, 21);
  assert.equal(region.depth, 21);
  assert.ok(region.max > 3.9 && region.min === 0);
  assert.equal(sampleTerrainRegion(hf, 0, 0, 1, 1), null, "te klein");
});

test("verf: 3 eigen texturen + grond per vak, rand gedeeld, vol = waarschuwing, gum", () => {
  const pf = createPaintfield();
  const touched = new Set();
  const before = [];
  const paint = (texture, x, z, extra = {}) => applyTerrainPaint(pf, Object.assign({ texture, x, z, radius: 3, strength: 1, softness: 0, dt: 0.25, touched, beforeTouch: (key, chunk) => before.push([key, chunk]) }, extra));
  const first = paint("terrain_texture:tex.zand", 64, 10);
  assert.ok(first.changed.has("0:0") && first.changed.has("1:0"), "rand bij x = 64 komt in beide vakken");
  assert.ok(before.every(([, chunk]) => chunk === null), "voor-kopie: vak bestond nog niet");
  assert.ok(terrainPaintAt(pf, 64, 10)["terrain_texture:tex.zand"] > 0.5);
  paint("terrain_texture:tex.gras", 20, 20);
  paint("terrain_texture:tex.rots", 30, 30);
  const full = paint("terrain_texture:tex.sneeuw", 40, 40);
  assert.ok(full.full.has("0:0"), "vierde eigen textuur past niet");
  assert.deepEqual(pf.chunks.get("0:0").layers, ["terrain_texture:tex.zand", "terrain_texture:tex.gras", "terrain_texture:tex.rots"]);
  for (let i = 0; i < 8; i += 1) paint("", 30, 30, { radius: 6 });
  assert.equal(terrainPaintAt(pf, 30, 30)["terrain_texture:tex.rots"] || 0, 0, "gum haalt de rots weg");
  tidyPaintChunk(pf.chunks.get("0:0"));
  assert.equal(pf.chunks.get("0:0").layers[2], "", "lege plek komt vrij");
  assert.equal(paint("terrain_texture:tex.sneeuw", 40, 40).full.size, 0, "nu past sneeuw wel");
  assert.equal(terrainPaintIsEmpty(pf.chunks.get("0:0")), false);
  assert.equal(applyTerrainPaint(pf, { texture: "", x: 500, z: 500, radius: 3, strength: 1, dt: 0.1 }).changed.size, 0, "gummen waar geen verf is maakt niets aan");
  // Echte gum: in één klik (dt 0, zachte rand) alles binnen de cirkel weg, net erbuiten blijft staan.
  paint("terrain_texture:tex.zand", 10, 50, { radius: 6 });
  const erased = applyTerrainPaint(pf, { erase: true, x: 10, z: 50, radius: 4, softness: 1, strength: 0, dt: 0 });
  assert.ok(erased.changed.has("0:0"));
  assert.equal(terrainPaintAt(pf, 10, 50)["terrain_texture:tex.zand"] || 0, 0, "midden helemaal weg");
  assert.equal(terrainPaintAt(pf, 13.5, 50)["terrain_texture:tex.zand"] || 0, 0, "ook vlak bij de rand helemaal weg");
  assert.ok(terrainPaintAt(pf, 15, 50)["terrain_texture:tex.zand"] > 0.5, "buiten de cirkel blijft de verf");
  assert.equal(applyTerrainPaint(pf, { erase: true, x: 900, z: 900, radius: 4 }).changed.size, 0, "gum maakt geen vakken aan");
});

test("kaarten: terreintextuur, stempel en verflijst; alles van de grond in de tab Terrein", () => {
  assert.equal(CANONICAL_KINDS.terrain_settings.place, "terrein");
  assert.equal(CANONICAL_KINDS.world_settings.fields.groundTextureAssetId.ui.place, "terrein");
  assert.equal(CANONICAL_KINDS.world_settings.fields.startX.ui.place, "instellingen");
  assert.equal(validateDocument("terrain_texture", { textureId: "tex.gras", displayName: "Gras", textureAssetId: "asset_abc", tileSize: 4 }).ok, true);
  assert.equal(validateDocument("terrain_texture", { textureId: "tex.gras", displayName: "Gras" }).ok, false, "plaatje verplicht");
  assert.equal(validateDocument("terrain_stamp", { stampId: "stamp.berg", displayName: "Berg", imageAssetId: "asset_abc", size: 120, height: -6 }).ok, true);
  const file = "b".repeat(40);
  assert.equal(validateDocument("terrain_settings", { paint: { "0:0": { file, layers: ["terrain_texture:tex.gras", "", ""] } } }).ok, true);
  assert.equal(validateDocument("terrain_settings", { paint: { "0:0": { file, layers: ["item_definition:x"] } } }).ok, false);
  assert.equal(validateDocument("terrain_settings", { paint: { "0:0": { file: "kort", layers: [] } } }).ok, false);
  assert.equal(validateDocument("terrain_settings", { paint: { "0:0": { file, layers: ["", "", "", ""] } } }).ok, false);
});

test("server: verf-PNG bewaren; wereld krijgt verf, texturen met plaatje en rots", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-verf-"));
  try {
    const service = Object.create(AssetService.prototype);
    service.assetsDir = dir;
    const png = Buffer.from(await encodePng({ width: 129, height: 129, channels: 3, bitDepth: 8, data: new Uint8Array(129 * 129 * 3).fill(9) }));
    const saved = service.saveTerrainPaint({ "1:-2": { data: png } });
    assert.match(saved["1:-2"], /^[0-9a-f]{40}$/);
    assert.ok(fs.existsSync(path.join(dir, "terrain", saved["1:-2"] + ".png")));
    const small = Buffer.from(await encodePng({ width: 64, height: 64, channels: 3, bitDepth: 8, data: new Uint8Array(64 * 64 * 3) }));
    assert.throws(() => service.saveTerrainPaint({ "1:-2": { data: small } }), /129/);
    assert.throws(() => service.saveTerrainPaint({ "x": { data: png } }), /Onbekend/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const file = "c".repeat(40);
  const data = {
    terrain: { paint: { "0:0": { file, layers: ["terrain_texture:tex.zand", "", ""] } }, rockTextureRef: "terrain_texture:tex.rots", rockSlopeDeg: 38 },
    terrainTextures: [
      { docKey: "terrain_texture:tex.zand", textureId: "tex.zand", displayName: "Zand", textureAssetId: "asset_zand", tileSize: 3 },
      { docKey: "terrain_texture:tex.rots", textureId: "tex.rots", displayName: "Rots", textureAssetId: "asset_rots", tileSize: 6 }
    ]
  };
  const asked = [];
  const assetService = { readTerrainChunk: () => null, manifestForIds: (ids) => { asked.push(...ids); return ids.map((id) => ({ id, sourcePath: "/assets/" + id + ".png" })); } };
  const world = buildRuntimeWorld(data, { assetService });
  const paint = world.terrain.heightfield.paint;
  assert.deepEqual(paint.chunks["0:0"], { file, layers: ["terrain_texture:tex.zand", "", ""] });
  assert.equal(paint.textures["terrain_texture:tex.zand"].url, "/assets/asset_zand.png");
  assert.equal(paint.textures["terrain_texture:tex.rots"].size, 6);
  assert.deepEqual(paint.rock, { texture: "terrain_texture:tex.rots", slopeDeg: 38 });
  assert.ok(asked.includes("asset_zand") && asked.includes("asset_rots"), "plaatjes komen in de assetlijst");
  const plain = buildRuntimeWorld({});
  assert.deepEqual(plain.terrain.heightfield.paint, { chunks: {}, textures: {}, rock: null });
});
