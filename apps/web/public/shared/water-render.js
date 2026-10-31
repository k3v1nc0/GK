// Ronde 3: watervlakken tekenen. Elk water is een los, plat vlak (2 driehoeken) op zijn eigen hoogte, doorzichtig,
// met golfjes als optie (een klein ruisplaatje dat langzaam schuift; uit = alleen een kleur, lichter voor de laptop).
// De oever ontstaat vanzelf waar het terrein boven het water uitkomt.
import * as THREE from "three";
import { normalizeTerrainWater } from "./terrain.js";

const RIPPLE_SIZE = 64;
const RIPPLE_METERS = 6;
let rippleImage = null;

// Een naadloos golfjesplaatje (normal map) van een paar golven over elkaar; één keer gemaakt.
function rippleData() {
  if (rippleImage) return rippleImage;
  const size = RIPPLE_SIZE;
  const waves = [[1, 2, 0.6], [3, -1, 0.35], [-2, 3, 0.25], [5, 4, 0.12]];
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let h = 0;
      for (const [a, b, amp] of waves) h += Math.sin((2 * Math.PI * (a * x + b * y)) / size) * amp;
      height[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x + size - 1) % size)];
      const dy = height[((y + 1) % size) * size + x] - height[((y + size - 1) % size) * size + x];
      const nx = -dx * 0.5;
      const ny = -dy * 0.5;
      const length = Math.hypot(nx, ny, 1);
      const i = (y * size + x) * 4;
      data[i] = Math.round(((nx / length) * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round(((ny / length) * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round(((1 / length) * 0.5 + 0.5) * 255);
      data[i + 3] = 255;
    }
  }
  rippleImage = data;
  return data;
}

function rippleTexture(water) {
  const texture = new THREE.DataTexture(rippleData(), RIPPLE_SIZE, RIPPLE_SIZE, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.repeat.set(Math.max(1, water.width / RIPPLE_METERS), Math.max(1, water.depth / RIPPLE_METERS));
  texture.needsUpdate = true;
  return texture;
}

export function createWaterLayer({ scene, requestRender = () => {} }) {
  const group = new THREE.Group();
  group.name = "gk-water";
  scene.add(group);
  let entries = [];
  let key = "";
  let waveMeshes = 0;

  function clear() {
    for (const entry of entries) {
      group.remove(entry.mesh);
      entry.mesh.geometry.dispose();
      if (entry.mesh.material.normalMap) entry.mesh.material.normalMap.dispose();
      entry.mesh.material.dispose();
    }
    entries = [];
    waveMeshes = 0;
  }

  // waters: lijst uit world.terrain.water of uit de kaarten (editor). groundY = basishoogte van de grond.
  function setWater(waters, groundY = 0) {
    const list = (Array.isArray(waters) ? waters : []).map(normalizeTerrainWater).filter(Boolean);
    // Ronde 3b: hangt de groep niet (meer) in de scene, dan terugzetten; anders zie je het water niet.
    if (group.parent !== scene) scene.add(group);
    group.visible = true;
    const nextKey = JSON.stringify([Number(groundY) || 0, list]);
    if (nextKey === key) return;
    key = nextKey;
    clear();
    for (const water of list) {
      const geometry = new THREE.PlaneGeometry(water.width, water.depth);
      geometry.rotateX(-Math.PI / 2);
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(water.color), roughness: 0.2, metalness: 0.05,
        transparent: water.opacity < 1, opacity: water.opacity, depthWrite: water.opacity >= 1
      });
      if (water.waves) {
        material.normalMap = rippleTexture(water);
        material.normalScale = new THREE.Vector2(0.6, 0.6);
        waveMeshes += 1;
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "gk-water:" + water.id;
      mesh.position.set(water.x, (Number(groundY) || 0) + water.height, water.z);
      // Zelfde draairichting als de loopregels (movement-kernel): Three draait de andere kant op.
      mesh.rotation.y = -water.rotation * Math.PI / 180;
      mesh.renderOrder = 2;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      // De opruimcode voor losse vlakken moet water als echt terrein herkennen.
      mesh.userData.terrainRuntime = true;
      mesh.userData.gkWater = water.id;
      group.add(mesh);
      entries.push({ water, mesh });
    }
    requestRender("water");
  }

  // Golfjes laten schuiven (alleen als er getekend wordt; vraagt zelf geen extra beelden).
  function update(timeMs) {
    if (!waveMeshes) return;
    const t = (Number(timeMs) || 0) / 1000;
    for (const entry of entries) {
      const map = entry.mesh.material.normalMap;
      if (map) map.offset.set((t * 0.02) % 1, (t * 0.013) % 1);
    }
  }

  function dispose() {
    clear();
    scene.remove(group);
  }

  return { group, setWater, update, dispose, list: () => entries.map((entry) => entry.water) };
}
