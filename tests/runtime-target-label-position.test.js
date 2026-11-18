import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as THREE from "three";

const source = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
function runtimeFunction(name) {
  const start = source.indexOf("  function " + name + "(");
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf("\n  function ", start + 1));
}

test("NPC-label blijft boven het model bij beide laadvolgordes", () => {
  for (const loadedFirst of [true, false]) {
    const visual = new THREE.Group();
    visual.position.set(23, 4, -17);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    mesh.position.y = 1;
    if (loadedFirst) visual.add(mesh);
    let now = 0;
    // Alleen constructie en de echte bounds-meting; geen renderer, server of speldata.
    const make = new Function("THREE", "visual", "performance", `
      const num = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
      const runtimeTargetPosition = () => visual.position;
      const runtimeTargetEditorSelectableId = () => "";
      const runtimeTargetEditorTransformable = () => false;
      const runtimeTargetAttachedEntityId = () => "npc_entity.smid";
      const createRuntimeTargetRangeRing = () => new THREE.Group();
      const createRuntimeTargetNameplate = () => null;
      const markRuntimeTargetTree = () => {};
      ${runtimeFunction("runtimeVisualMeasurement")}
      function measure(root) {
        return runtimeVisualMeasurement(root, [visual], "measurement", { resolved: false });
      }
      function createRuntimeTargetHitProxy(target, root) { measure(root); }
      ${runtimeFunction("createRuntimeTargetRoot")}
      return { createRuntimeTargetRoot, measure };
    `)(THREE, visual, { now: () => now });
    const root = make.createRuntimeTargetRoot({ instanceId: "smid", renderBody: false });
    root.position.copy(visual.position); // De daaropvolgende reguliere target-update.
    if (!loadedFirst) visual.add(mesh);
    now = 300; // Opnieuw meten na een nog niet geladen model.
    const measured = make.measure(root);
    const anchor = root.localToWorld(new THREE.Vector3(measured.centerX, measured.topY, measured.centerZ));
    assert.equal(measured.resolved, true);
    assert.deepEqual(anchor.toArray(), [23, 6, -17], "model eerst geladen: " + loadedFirst);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
});

test("Vijand-label staat recht boven de eigen positie, ook als het model gedraaid is", () => {
  // Gemeten midden ligt naast de voeten; bij een draaiend model klopt dat midden niet meer.
  const labelPoint = new Function("THREE", `
    const runtimeTargetVisualMeasurement = () => ({ centerX: 0.5, centerY: 0.7, centerZ: -0.25, topY: 1.5 });
    const runtimeTargetPresentationConfig = () => ({ labelOffsetMeters: 0.25 });
    ${runtimeFunction("runtimeTargetLabelPoint")}
    return runtimeTargetLabelPoint;
  `)(THREE);
  const root = new THREE.Group();
  root.position.set(10, 2, -4);
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  assert.deepEqual(labelPoint(root, { actorTarget: true, entityKind: "enemy" }, point).toArray(), [10, 3.75, -4]);
  // Een grondstof draait nooit; die houdt het gemeten midden.
  assert.deepEqual(labelPoint(root, { actorTarget: true, entityKind: "resource" }, point).toArray(), [10.5, 3.75, -4.25]);
  // Een vast doel (pickup, NPC op zijn plek) houdt het gemeten midden van zijn model.
  assert.deepEqual(labelPoint(root, {}, point).toArray(), [10.5, 3.75, -4.25]);
});

test("Naamlabel: onderkant-midden op het anker, afgerond op hele schermpixels", async () => {
  const { labelOffset } = await import("../apps/web/public/game/hud/label-placement.js");
  // 1x scherm: 200 - 81/2 = 159.5 wordt 160; 150 - 30 = 120.
  assert.deepEqual(labelOffset(200, 150, 81, 30, 0, 0, 1), { x: 160, y: 120 });
  // 125%-scherm: 159.5 * 1.25 = 199.375 wordt fysieke pixel 199 (= 159.2 css-px), min de laagpositie.
  const at = labelOffset(200, 150, 81, 30, 10, 20, 1.25);
  assert.ok(Math.abs(at.x - 149.2) < 1e-9, "x " + at.x);
  assert.equal(at.y, 100);
  assert.ok(Math.abs((10 + at.x) * 1.25 - 199) < 1e-9, "linkerrand op een hele fysieke pixel");
});
