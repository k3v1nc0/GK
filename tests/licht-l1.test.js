// L1 (26-11): 💡 Licht op een model (lantaarn, fakkel aan de muur, kampvuur): velden in de editor, door de build naar
// de game, en in de game een gloed + lichtplek (geen echte lamp; dat is L2).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { LIGHT_GROUP, lightOf } from "../src/shared/authoring/kinds/light-fields.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";

const doc = (kind, body, key) => ({ docKey: key, kind, archived: false, body });
const LAMP = { placedModelId: "pm.lantaarn", displayName: "Lantaarn", modelAssetId: "asset.lantaarn", x: 3, y: 0, z: 4 };

test("editor: blok 💡 Licht op een model, uit tot je het aanzet", () => {
  const fields = CANONICAL_KINDS.placed_model.fields;
  for (const key of ["light", "lightColor", "lightStrength", "lightRange", "lightFlicker", "lightGlow", "lightHeight", "lightX", "lightZ", "lightNightOnly"]) {
    assert.equal(fields[key].ui.group, LIGHT_GROUP, key + " staat in het blok Licht");
    assert.ok(fields[key].help?.waarvoor, key + " heeft uitleg");
  }
  assert.equal(fields.light.default, false);
  assert.deepEqual(fields.lightRange.ui.when, { key: "light", is: [true] }, "de rest verschijnt pas als Geeft licht aan staat");
  assert.equal(validateDocument("placed_model", Object.assign({}, LAMP, { light: true, lightColor: "#ff9900", lightRange: 5 })).issues.length, 0);
  assert.ok(validateDocument("placed_model", Object.assign({}, LAMP, { light: true, lightColor: "oranje" })).issues.some((entry) => entry.field === "lightColor"));
});

test("build: alleen een model met Geeft licht krijgt licht mee, netjes binnen de grenzen", () => {
  assert.equal(lightOf({ light: false, lightRange: 5 }), null);
  assert.deepEqual(lightOf({ light: true, lightColor: "#FF9900", lightRange: 99, lightFlicker: -1 }),
    { color: "#ff9900", strength: 1, range: 20, flicker: 0, glow: 0.6, height: 1.5, x: 0, z: 0, nightOnly: false });
  const docs = [
    doc("placed_model", Object.assign({}, LAMP, { light: true, lightStrength: 1.5, lightNightOnly: true }), "placed_model:pm.lantaarn"),
    doc("placed_model", { placedModelId: "pm.steen", displayName: "Steen", modelAssetId: "asset.steen", x: 0, y: 0, z: 0 }, "placed_model:pm.steen")
  ];
  const world = buildRuntimeWorld({ game: compileGameSection(docs, {}).server });
  const lamp = world.entities.find((entity) => entity.id === "placed.pm.lantaarn");
  assert.equal(lamp.light.strength, 1.5);
  assert.equal(lamp.light.nightOnly, true);
  assert.ok(!("light" in world.entities.find((entity) => entity.id === "placed.pm.steen")));
});

test("game: gloed + lichtplek, volgt dag en nacht, telt niet als spookvlak", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(src, /if \(entity\.light\) addLamp\(worldData, root, entity\.light\);/);
  assert.match(src, /\|\| object\.userData\?\.gkLamp/, "vrijstelling bij de spookvlak-opruimer");
  assert.match(src, /if \(lampRecords\.length \|\| realLampSlots\.length\) updateLamps\(time\);/);
  assert.match(src, /lampNight = Number\.isFinite\(Number\(nightMix\)\)/, "setDaylight zet hoe donker het is");
});

test("editor: ✋ Vlam verplaatsen zet de vlam ook opzij (Vlam X/Z, draait mee met het model)", () => {
  assert.equal(lightOf({ light: true, lightX: 0.4, lightZ: -0.25, lightHeight: 2.1 }).x, 0.4);
  assert.equal(lightOf({ light: true, lightX: 0.4, lightZ: -0.25, lightHeight: 2.1 }).z, -0.25);
  const runtimeSrc = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  for (const name of ["lampFitStart", "lampFitPreview", "lampFitDrag", "lampFitStop"]) assert.match(runtimeSrc, new RegExp(name + ": " + name), name + " zit in de runtime");
  assert.match(runtimeSrc, /if \(lampFitId && record\.id === lampFitId\) attachLampFitHelper\(record\);/, "pijlen komen terug na opnieuw opbouwen");
  const fitSrc = fs.readFileSync("apps/web/public/editor/lamp-fit-editor.js", "utf8");
  assert.match(fitSrc, /lightX: done\.preview\.x, lightHeight: done\.preview\.y, lightZ: done\.preview\.z/);
  assert.match(fs.readFileSync("apps/web/public/editor/editor.js", "utf8"), /if \(lampFitEditor\.handleKeyDown\(event\)\) return;/);
});

test("editor: Ctrl+C / Ctrl+V / Ctrl+D voor losse modellen (straatlantaarns dupliceren, licht gaat mee)", () => {
  const src = fs.readFileSync("apps/web/public/editor/editor.js", "utf8");
  assert.match(src, /if \(keyMatches\(event, "c"\) && copyPlacedModels\(\)\)/);
  assert.match(src, /void pastePlacedModels\(placedModelClipboard, terrainLastPointerGroundPoint\(\)\)/);
  assert.match(src, /const copy = Object\.assign\(\{\}, body, \{ placedModelId: base \+ "_" \+ n, x: round2\(x\), z: round2\(z\) \}\);/, "alles mee, nieuw id en plek");
});

test("game: ook gebundelde modellen (10x dezelfde straatlantaarn) geven licht", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(src, /if \(entity\.light\) addLampOnlyRoot\(worldData, entity, chunkKeyValue\);/);
  assert.match(src, /return record\.lampOnly \? Boolean\(record\.root\.parent\) : entityRoots\.get\(record\.id\) === record\.root;/);
});

test("game: Instellingen > Lampen tegelijk (0 = alle), de dichtstbijzijnde branden", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(src, /setLampLimit: setLampLimit,/);
  assert.match(src, /if \(mode !== "game" \|\| time - lampPickAt > 250 \|\| lampPickAt > time\) pickNearLamps\(time, night\);/, "4x per seconde opnieuw kiezen");
  assert.match(src, /const on = cfg\.strength \* level \* record\.fade;/, "rustig aan en uit");
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.match(hud, /"data-lamp-limit": ""/);
  assert.match(hud, /if \(typeof api\.setLampLimit === "function"\) api\.setLampLimit\(lampLimitValue\(\)\);/);
  assert.match(fs.readFileSync("apps/web/public/game/game.js", "utf8"), /state\.runtime\.setLampLimit\(gkHudLamps\)/);
});

test("L2: vaste set echte lampen (Echte lampen 0-4, standaard 3) bij de dichtstbijzijnde brandende lampen", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.equal((src.match(/new THREE\.PointLight\(/g) || []).length, 1, "maar op één plek, in de vaste set");
  assert.match(src, /let realLampCount = 3;/);
  assert.match(src, /const want = rendererProfile\.software === true \|\| !realLampEver \? 0 : realLampCount;/, "zonder GPU geen echte lampen");
  assert.match(src, /light\.castShadow = false;/);
  assert.match(src, /for \(let index = 0; index < near\.length && index < pool; index \+= 1\) near\[index\]\.record\.realWant = true;/);
  assert.match(src, /setRealLampCount: setRealLampCount,/);
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.match(hud, /"data-real-lamps": ""/);
  assert.match(hud, /api\.setRealLamps\(realLampValue\(\)\)/);
  assert.match(fs.readFileSync("apps/web/public/game/game.js", "utf8"), /state\.runtime\.setRealLampCount\(gkHudRealLamps\)/);
});

test("Kevin 26-11: lichtplek over heuvels, bergen en kuilen; echte lamp loopt zachter af", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(src, /new THREE\.PlaneGeometry\(cfg\.range \* 2, cfg\.range \* 2, spotSegments, spotSegments\)/, "plek is een net");
  assert.match(src, /pos\.setY\(index, lampFloorY\(record\.worldData, root\.x \+ p\.x \+ gx, root\.z \+ p\.z \+ gz, rootY \+ p\.y\) - rootY\);/, "elk punt op de grond");
  assert.match(src, /for \(const record of lampRecords\) placeLamp\(record, record\.offset\);/, "opnieuw als het terrein laadt");
  assert.match(src, /new THREE\.PointLight\(0xffb04a, 0, 10, 1\)/);
});

test("Kevin 26-11: gloed niet afgesneden door de grond, wel afgedekt door een character ervoor", () => {
  const src = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(src, /"      z = max\(z, \(viewMatrix \* vec4\(hit, 1\.0\)\)\.z\);",/, "hoek net voor de grond");
  assert.match(src, /pull: \{ value: 0\.25 \}, floorY: \{ value: -1e6 \} \}/, "verder maar 25 cm naar de camera");
  assert.match(src, /record\.glow\.material\.uniforms\.floorY\.value = floor;/);
  assert.ok(!/uniforms\.pull\.value = /.test(src), "fakkel niet meer voor het character getekend");
});
