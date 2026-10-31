import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createWaterLayer } from "../apps/web/public/shared/water-render.js";
import { removeGhostChunkPlanes } from "../apps/web/public/shared/world-runtime.js";

for (const mode of ["editor", "game"]) {
  test("water blijft zichtbaar na het opruimen van losse vlakken: " + mode, () => {
    const scene = new THREE.Scene();
    const layer = createWaterLayer({ scene });
    const waters = [
      { id: "ijs", x: -10, z: 0, width: 18, depth: 43, height: -1.3, behavior: "ice", waves: false },
      { id: "meer", x: 25, z: 9.5, width: 22.5, depth: 22, height: -0.1, behavior: "block" }
    ];
    layer.setWater(waters);
    const waterMeshes = layer.group.children.slice();
    const strayPlane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
    scene.add(strayPlane);

    try {
      const result = removeGhostChunkPlanes("water-test", { scene, mode, debugOverlayVisible: false });
      assert.equal(result.removedSuspiciousPlanes, 1, "het ongewenste vlak wordt nog steeds opgeruimd");
      assert.equal(strayPlane.parent, null);
      assert.equal(layer.group.parent, scene);
      assert.deepEqual(layer.group.children, waterMeshes, "beide watervlakken blijven in de scene");
      for (const mesh of waterMeshes) assert.equal(mesh.visible, true);

      // Een ongewijzigde wereld gebruikt de bestaande meshes opnieuw.
      layer.setWater(waters);
      assert.equal(removeGhostChunkPlanes("water-test-repeat", { scene, mode }).removedSuspiciousPlanes, 0);
      assert.deepEqual(layer.group.children, waterMeshes);
    } finally {
      layer.dispose();
    }
  });
}
