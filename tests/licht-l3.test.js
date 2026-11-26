// L3 (26-11): een fakkel die licht geeft in de hand. Hetzelfde blok 💡 Licht als op een model, door de build naar het
// item, in de game aan de hand (eigen speler en anderen), je eigen fakkel gaat altijd voor bij de echte lampen.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CANONICAL_KINDS } from "../src/shared/authoring/kinds.js";
import { ITEM_LIGHT_DEFAULTS, LIGHT_GROUP, lightOf } from "../src/shared/authoring/kinds/light-fields.js";
import { runtimeItemFromCanonical } from "../src/server/authoring/runtime-overlay.js";
import { gearFromItems } from "../apps/web/public/shared/equipment-attach.js";

const TORCH = { itemId: "item.fakkel", displayName: "Fakkel", equipSlot: "equipment_slot.off_hand", worldModelAssetId: "asset.fakkel" };

test("editor: item heeft het blok 💡 Licht, met beginwaarden voor in de hand", () => {
  const fields = CANONICAL_KINDS.item_definition.fields;
  for (const key of ["light", "lightColor", "lightStrength", "lightRange", "lightFlicker", "lightGlow", "lightHeight", "lightX", "lightZ", "lightNightOnly"]) {
    assert.equal(fields[key].ui.group, LIGHT_GROUP, key);
  }
  assert.equal(fields.lightHeight.default, ITEM_LIGHT_DEFAULTS.height);
  assert.match(fields.lightHeight.help.goed, /Passen/);
  assert.equal(CANONICAL_KINDS.placed_model.fields.lightHeight.default, 1.5, "model houdt zijn eigen beginwaarde");
});

test("build: item met Geeft licht krijgt light mee, uit = weg", () => {
  const lit = runtimeItemFromCanonical(Object.assign({}, TORCH, { light: true }));
  assert.deepEqual(lit.light, lightOf({ light: true }, ITEM_LIGHT_DEFAULTS));
  assert.equal(lit.light.height, 0.4);
  assert.ok(!("light" in runtimeItemFromCanonical(Object.assign({}, TORCH, { light: false }), lit)), "uit = weg, ook als het er eerst was");
});

test("game: gear-regel draagt het licht mee", () => {
  const items = { "item.fakkel": runtimeItemFromCanonical(Object.assign({}, TORCH, { light: true, lightHeight: 0.6 })) };
  const [row] = gearFromItems(["item.fakkel"], items);
  assert.equal(row.light.height, 0.6);
  const runtime = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(runtime, /if \(entry\.light\) attach\.lamp = addHandLamp\(attach, entry\.light, castShadow === true\);/);
  assert.match(runtime, /if \(attach\.lamp\) removeHandLamp\(attach\.lamp\);/, "uittrekken = lamp weg");
  assert.match(runtime, /if \(lampRecords\.length\) followHandLamps\(\);\n {4}if \(gpuFrameTimer\) gpuFrameTimer\.begin\(\);/, "vlak voor het tekenen de hand volgen");
  assert.match(runtime, /lit\.push\(\{ record, d: record\.own \? -1 : dx \* dx \+ dz \* dz \}\);/, "eigen fakkel gaat voor");
  assert.match(runtime, /if \(state\.spec\.light\) state\.lamp = addHandLamp\(state\.attach, state\.spec\.light, true\);/, "ook bij Passen");
  assert.match(fs.readFileSync("apps/web/public/editor/body-fit-editor.js", "utf8"), /light: lightSpec\(doc\.body\),/);
});
