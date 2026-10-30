// Wereld tekenen (ronde 1): de grond tekenen uit de hoogtekaart (terrain.js), in vakken van 64 x 64 m.
// - Alleen vakken rond de speler (game) of de camera (editor) krijgen een mesh.
// - 2 niveaus: dichtbij fijn (fout max 5 cm), verder weg grof (fout max 50 cm). Vlak = 2 driehoeken.
// - De hoogte zelf (8 KB per vak) wordt voor de hele wereld geladen: lopen en de minimap hebben hem nodig.
// - Een vak heet naar zijn vingerafdruk (sha1) en verandert nooit; de browser bewaart hem dus.
// Ronde 2: verf (per vak 3 eigen texturen + de grond, gewichtsplaatje 129 x 129) en rots op steile hellingen.
// Dichtbij mengt de shader de echte texturen; veraf alleen hun gemiddelde kleur (licht, zoals een thumb).
import * as THREE from "three";
import { effectiveGroundBounds } from "./movement-kernel.js";
import {
  TERRAIN_CHUNK_METERS, TERRAIN_LOD_NEAR_ERROR, TERRAIN_LOD_FAR_ERROR, TERRAIN_TRI_BUDGET, TERRAIN_CHUNK_TRI_BUDGET,
  TERRAIN_PAINT_VERTS, createHeightfield, decodeTerrainChunk, buildTerrainChunkMesh, terrainChunkErrors, countTerrainChunkTriangles,
  terrainHeightAt, raycastTerrain, parseTerrainChunkKey, createPaintfield, terrainPaintFromPng
} from "./terrain.js";
import { decodePng } from "./png.js";

const SIZE = TERRAIN_CHUNK_METERS;
const decoded = new Map();
const pending = new Map();
const decodedPaint = new Map();
const pendingPaint = new Map();
const WHITE = new THREE.Color(1, 1, 1);
const GREY = new THREE.Color(0.35, 0.35, 0.35);
const HEAVY_TINT = new THREE.Color(1, 1, 1).lerp(new THREE.Color("#ff2a2a"), 0.65);

// Na opslaan: de net bewaarde verf staat al in het geheugen.
export function seedTerrainPaint(sha1, data) {
  if (sha1 && data) decodedPaint.set(String(sha1), data.slice());
}

function fetchPaint(baseUrl, sha1) {
  if (decodedPaint.has(sha1)) return Promise.resolve(decodedPaint.get(sha1));
  if (pendingPaint.has(sha1)) return pendingPaint.get(sha1);
  const promise = fetch(baseUrl + sha1 + ".png", { credentials: "same-origin" })
    .then(function (response) { return response.ok ? response.arrayBuffer() : null; })
    .then(function (buffer) { return buffer ? decodePng(new Uint8Array(buffer)) : null; })
    .then(function (png) {
      const data = terrainPaintFromPng(png);
      if (data) decodedPaint.set(sha1, data);
      return data;
    })
    .catch(function () { return null; })
    .finally(function () { pendingPaint.delete(sha1); });
  pendingPaint.set(sha1, promise);
  return promise;
}

// De shader: één functie voor alle vakken (dezelfde code = één programma op de videokaart).
const FRAG_HEAD = `
varying vec2 gkWorldXZ;
varying float gkNormalY;
uniform vec3 gkTint;
#ifdef GK_PAINT
uniform sampler2D gkSplat;
uniform vec2 gkChunkOrigin;
uniform vec3 gkA1;
uniform vec3 gkA2;
uniform vec3 gkA3;
#ifndef GK_FAR
uniform sampler2D gkL1;
uniform sampler2D gkL2;
uniform sampler2D gkL3;
uniform vec3 gkLInv;
uniform vec3 gkLHas;
#endif
#endif
#ifdef GK_ROCK
uniform float gkRockCos;
uniform vec3 gkRockAvg;
#ifndef GK_FAR
uniform sampler2D gkRock;
uniform float gkRockInv;
uniform float gkRockHas;
#endif
#endif
`;
const FRAG_BODY = `
{
  vec3 gkC = diffuseColor.rgb;
  #ifdef GK_PAINT
    vec2 gkUv = ((gkWorldXZ - gkChunkOrigin) * ${(TERRAIN_PAINT_VERTS - 1) / SIZE}.0 + 0.5) / ${TERRAIN_PAINT_VERTS}.0;
    vec3 gkW = texture2D(gkSplat, gkUv).rgb;
    float gkSum = gkW.r + gkW.g + gkW.b;
    if (gkSum > 1.0) { gkW /= gkSum; gkSum = 1.0; }
    #ifdef GK_FAR
      vec3 gkC1 = gkA1;
      vec3 gkC2 = gkA2;
      vec3 gkC3 = gkA3;
    #else
      vec3 gkC1 = mix(gkA1, texture2D(gkL1, gkWorldXZ * gkLInv.x).rgb, gkLHas.x);
      vec3 gkC2 = mix(gkA2, texture2D(gkL2, gkWorldXZ * gkLInv.y).rgb, gkLHas.y);
      vec3 gkC3 = mix(gkA3, texture2D(gkL3, gkWorldXZ * gkLInv.z).rgb, gkLHas.z);
    #endif
    gkC = gkC * (1.0 - gkSum) + gkC1 * gkW.r + gkC2 * gkW.g + gkC3 * gkW.b;
  #endif
  #ifdef GK_ROCK
    float gkSteep = 1.0 - smoothstep(gkRockCos - 0.04, gkRockCos + 0.04, gkNormalY);
    #ifdef GK_FAR
      vec3 gkR = gkRockAvg;
    #else
      vec3 gkR = mix(gkRockAvg, texture2D(gkRock, gkWorldXZ * gkRockInv).rgb, gkRockHas);
    #endif
    gkC = mix(gkC, gkR, gkSteep);
  #endif
  diffuseColor.rgb = gkC * gkTint;
}
`;

function patchTerrainShader(shader) {
  Object.assign(shader.uniforms, this.userData.gkUniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 gkWorldXZ;\nvarying float gkNormalY;")
    .replace("#include <begin_vertex>", "#include <begin_vertex>\ngkWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;\ngkNormalY = normal.y;");
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\n" + FRAG_HEAD)
    .replace("#include <map_fragment>", "#include <map_fragment>\n" + FRAG_BODY);
}

function terrainProgramKey() {
  return "gk-terrain-2";
}

function makeUniforms() {
  return {
    gkTint: { value: new THREE.Color(1, 1, 1) },
    gkSplat: { value: null },
    gkChunkOrigin: { value: new THREE.Vector2() },
    gkA1: { value: GREY.clone() },
    gkA2: { value: GREY.clone() },
    gkA3: { value: GREY.clone() },
    gkL1: { value: null },
    gkL2: { value: null },
    gkL3: { value: null },
    gkLInv: { value: new THREE.Vector3(0.25, 0.25, 0.25) },
    gkLHas: { value: new THREE.Vector3() },
    gkRockCos: { value: Math.cos((40 * Math.PI) / 180) },
    gkRockAvg: { value: GREY.clone() },
    gkRock: { value: null },
    gkRockInv: { value: 0.25 },
    gkRockHas: { value: 0 }
  };
}

function averageColor(image) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 8;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, 8, 8);
    const data = context.getImageData(0, 0, 8, 8).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const count = (data.length / 4) * 255;
    return new THREE.Color().setRGB(r / count, g / count, b / count, THREE.SRGBColorSpace);
  } catch {
    return GREY.clone();
  }
}

// Na Sluiten in de editor: de net bewaarde vakken staan al in het geheugen (niet opnieuw downloaden).
export function seedTerrainChunk(sha1, chunk) {
  if (sha1 && chunk) decoded.set(String(sha1), chunk.slice());
}

function fetchChunk(baseUrl, sha1) {
  if (decoded.has(sha1)) return Promise.resolve(decoded.get(sha1));
  if (pending.has(sha1)) return pending.get(sha1);
  const promise = fetch(baseUrl + sha1 + ".bin", { credentials: "same-origin" })
    .then(function (response) { return response.ok ? response.arrayBuffer() : null; })
    .then(function (buffer) {
      const chunk = buffer ? decodeTerrainChunk(buffer) : null;
      if (chunk) decoded.set(sha1, chunk);
      return chunk;
    })
    .catch(function () { return null; })
    .finally(function () { pending.delete(sha1); });
  pending.set(sha1, promise);
  return promise;
}

export function createTerrainLayer(options = {}) {
  const scene = options.scene;
  const mode = options.mode === "editor" ? "editor" : "game";
  const requestRender = typeof options.requestRender === "function" ? options.requestRender : function () {};
  const group = new THREE.Group();
  group.name = "GK terrein";
  group.userData.terrainHeightLayer = true;
  if (scene) scene.add(group);
  const heightfield = createHeightfield();
  const records = new Map();
  const revisions = new Map();
  const errorCache = new Map();
  const dirty = new Set();
  let config = null;
  let refs = {};
  let baseUrl = "/assets/terrain/";
  let bounds = null;
  let groundY = 0;
  let material = null;
  let heavyMaterial = null;
  let textureSize = { x: 10, z: 10 };
  let receiveShadow = true;
  let loadToken = 0;
  let loadPromise = Promise.resolve();
  let loading = 0;
  let bakeAll = false;
  let needsUpdate = true;
  let centerKey = "";
  let centerX = 0;
  let centerZ = 0;
  let heavyTint = false;
  let triBudget = TERRAIN_TRI_BUDGET;
  let chunkBudget = TERRAIN_CHUNK_TRI_BUDGET;
  const GAME_VIEW_RADIUS = 4;
  const viewRadius = mode === "game" ? GAME_VIEW_RADIUS : 6;
  const nearRadius = 1;
  let cursor = null;
  // Verf: in de game alleen dichtbij de echte texturen, in de editor overal (daar teken je).
  const paint = createPaintfield();
  const paintDirty = new Set();
  const paintRevisions = new Map();
  const splatTextures = new Map();
  const layerTextures = new Map();
  const textureLoader = new THREE.TextureLoader();
  const paintFarRadius = mode === "game" ? nearRadius : Infinity;
  let paintRefs = {};
  let paintTextures = {};
  let rockConfig = null;

  function revisionOf(key) {
    return revisions.get(key) || 0;
  }

  function bump(key) {
    revisions.set(key, revisionOf(key) + 1);
    errorCache.delete(key);
    needsUpdate = true;
  }

  function errorsFor(key) {
    const revision = revisionOf(key);
    const cached = errorCache.get(key);
    if (cached && cached.revision === revision) return cached;
    const chunk = heightfield.chunks.get(key) || null;
    const errors = chunk ? terrainChunkErrors(chunk) : null;
    const entry = { revision, errors, nearTris: countTerrainChunkTriangles(errors, TERRAIN_LOD_NEAR_ERROR),
      farTris: countTerrainChunkTriangles(errors, TERRAIN_LOD_FAR_ERROR) };
    errorCache.set(key, entry);
    return entry;
  }

  function chunkRange() {
    if (!bounds) return null;
    return {
      x0: Math.floor(bounds.minX / SIZE),
      x1: Math.floor((bounds.maxX - 0.000001) / SIZE),
      z0: Math.floor(bounds.minZ / SIZE),
      z1: Math.floor((bounds.maxZ - 0.000001) / SIZE)
    };
  }

  function disposeRecord(key) {
    const record = records.get(key);
    if (!record) return;
    if (record.mesh.parent) record.mesh.parent.remove(record.mesh);
    record.mesh.geometry.dispose();
    disposeCustom(record);
    records.delete(key);
  }

  // ---------- verf en rots: materiaal per vak ----------

  function layerTexture(info) {
    const url = info?.url ? String(info.url) : "";
    if (!url) return null;
    let entry = layerTextures.get(url);
    if (entry) return entry;
    entry = { texture: null, avg: GREY.clone(), ready: false };
    layerTextures.set(url, entry);
    textureLoader.load(url, function (texture) {
      if (layerTextures.get(url) !== entry) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
      texture.needsUpdate = true;
      entry.texture = texture;
      entry.avg = averageColor(texture.image);
      entry.ready = true;
      syncAllMaterials();
      requestRender("terrain-layer-texture");
    }, undefined, function () { entry.failed = true; });
    return entry;
  }

  function rockInfo() {
    return rockConfig?.texture ? paintTextures[rockConfig.texture] || null : null;
  }

  function paintRevisionOf(key) {
    return paintRevisions.get(key) || 0;
  }

  function splatTexture(key) {
    const chunk = paint.chunks.get(key);
    if (!chunk) return null;
    let texture = splatTextures.get(key);
    if (!texture) {
      texture = new THREE.DataTexture(new Uint8Array(TERRAIN_PAINT_VERTS * TERRAIN_PAINT_VERTS * 4), TERRAIN_PAINT_VERTS, TERRAIN_PAINT_VERTS, THREE.RGBAFormat);
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.NoColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.userData.revision = -1;
      splatTextures.set(key, texture);
    }
    if (texture.userData.revision !== paintRevisionOf(key)) {
      const out = texture.image.data;
      const data = chunk.data;
      for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        out[j] = data[i];
        out[j + 1] = data[i + 1];
        out[j + 2] = data[i + 2];
        out[j + 3] = 255;
      }
      texture.needsUpdate = true;
      texture.userData.revision = paintRevisionOf(key);
    }
    return texture;
  }

  function disposeSplat(key) {
    const texture = splatTextures.get(key);
    if (texture) texture.dispose();
    splatTextures.delete(key);
  }

  function disposeCustom(record) {
    if (record.custom) record.custom.dispose();
    record.custom = null;
    record.variant = "";
  }

  function variantFor(record) {
    const painted = paint.chunks.has(record.key);
    const rock = Boolean(rockInfo());
    if (!painted && !rock) return "";
    const far = bakeAll || (record.distance || 0) > paintFarRadius;
    return (painted ? "P" : "") + (rock ? "R" : "") + (far ? "F" : "");
  }

  function makeCustom(variant) {
    const custom = material.clone();
    custom.defines = Object.assign({}, custom.defines || {}, { GK_TERRAIN: "" });
    if (variant.includes("P")) custom.defines.GK_PAINT = "";
    if (variant.includes("R")) custom.defines.GK_ROCK = "";
    if (variant.includes("F")) custom.defines.GK_FAR = "";
    custom.userData.gkUniforms = makeUniforms();
    custom.onBeforeCompile = patchTerrainShader;
    custom.customProgramCacheKey = terrainProgramKey;
    return custom;
  }

  function syncMaterial(record) {
    if (!material) return;
    const heavy = heavyTint && record.nearTris > chunkBudget;
    const variant = variantFor(record);
    if (!variant) {
      disposeCustom(record);
      record.mesh.material = heavy && heavyMaterial ? heavyMaterial : material;
      return;
    }
    if (!record.custom || record.variant !== variant || record.customBase !== material) {
      disposeCustom(record);
      record.custom = makeCustom(variant);
      record.variant = variant;
      record.customBase = material;
    }
    const custom = record.custom;
    if (custom.map !== material.map) {
      custom.map = material.map;
      custom.needsUpdate = true;
    }
    const u = custom.userData.gkUniforms;
    u.gkTint.value.copy(heavy ? HEAVY_TINT : WHITE);
    u.gkChunkOrigin.value.set(record.cx * SIZE, record.cz * SIZE);
    const chunk = paint.chunks.get(record.key);
    if (chunk) {
      u.gkSplat.value = splatTexture(record.key);
      for (let slot = 0; slot < 3; slot += 1) {
        const info = chunk.layers[slot] ? paintTextures[chunk.layers[slot]] || null : null;
        const entry = layerTexture(info);
        u["gkL" + (slot + 1)].value = entry?.texture || null;
        u["gkA" + (slot + 1)].value.copy(entry ? entry.avg : GREY);
        u.gkLHas.value.setComponent(slot, entry?.ready ? 1 : 0);
        u.gkLInv.value.setComponent(slot, 1 / Math.max(0.1, Number(info?.size) || 4));
      }
    }
    const rock = rockInfo();
    if (rock) {
      const entry = layerTexture(rock);
      u.gkRock.value = entry?.texture || null;
      u.gkRockHas.value = entry?.ready ? 1 : 0;
      u.gkRockAvg.value.copy(entry ? entry.avg : GREY);
      u.gkRockInv.value = 1 / Math.max(0.1, Number(rock.size) || 4);
      u.gkRockCos.value = Math.cos((Math.max(5, Math.min(85, Number(rockConfig.slopeDeg) || 40)) * Math.PI) / 180);
    }
    record.mesh.material = custom;
  }

  function syncAllMaterials() {
    for (const record of records.values()) syncMaterial(record);
  }

  function buildRecord(want) {
    const errorInfo = errorsFor(want.key);
    const built = buildTerrainChunkMesh(heightfield, want.cx, want.cz, {
      maxError: want.lod === 0 ? TERRAIN_LOD_NEAR_ERROR : TERRAIN_LOD_FAR_ERROR,
      errors: errorInfo.errors || undefined
    });
    const positions = built.positions;
    const count = positions.length / 3;
    const uvs = new Float32Array(count * 2);
    const offsetX = want.cx * SIZE;
    const offsetZ = want.cz * SIZE;
    const minX = bounds.minX - offsetX;
    const maxX = bounds.maxX - offsetX;
    const minZ = bounds.minZ - offsetZ;
    const maxZ = bounds.maxZ - offsetZ;
    for (let v = 0; v < count; v += 1) {
      // De rand van de wereld: punten buiten de grond schuiven op de rand (geen grond buiten de wereld).
      const x = Math.min(maxX, Math.max(minX, positions[v * 3]));
      const z = Math.min(maxZ, Math.max(minZ, positions[v * 3 + 2]));
      positions[v * 3] = x;
      positions[v * 3 + 2] = z;
      uvs[v * 2] = (offsetX + x) / textureSize.x;
      uvs[v * 2 + 1] = (offsetZ + z) / textureSize.z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(built.normals, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
    geometry.computeBoundingSphere();
    let record = records.get(want.key);
    if (record) {
      record.mesh.geometry.dispose();
      record.mesh.geometry = geometry;
    } else {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "terrein " + want.key;
      mesh.userData.terrainRuntime = true;
      mesh.userData.terrainHeightChunk = want.key;
      mesh.userData.groundPlane = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      record = { key: want.key, cx: want.cx, cz: want.cz, mesh };
      records.set(want.key, record);
    }
    record.mesh.position.set(offsetX, groundY, offsetZ);
    record.mesh.receiveShadow = receiveShadow;
    record.mesh.updateMatrix();
    record.lod = want.lod;
    record.distance = want.distance;
    record.revision = revisionOf(want.key);
    record.tris = built.triangles;
    record.nearTris = errorInfo.nearTris;
    syncMaterial(record);
  }

  // Elke frame: kijkt of er vakken bij moeten, weg moeten of opnieuw getekend moeten worden.
  // Geeft true als er nog werk is (dan nog een frame tekenen).
  function update(x, z) {
    if (!config || !material) return false;
    const ccx = Math.floor((Number(x) || 0) / SIZE);
    const ccz = Math.floor((Number(z) || 0) / SIZE);
    const key = ccx + ":" + ccz;
    if (key !== centerKey) {
      centerKey = key;
      needsUpdate = true;
    }
    centerX = Number(x) || 0;
    centerZ = Number(z) || 0;
    if (!needsUpdate) return false;
    needsUpdate = false;
    const range = chunkRange();
    if (!range) return false;
    const wanted = [];
    const wantedKeys = new Set();
    const rx0 = bakeAll ? range.x0 : Math.max(range.x0, ccx - viewRadius);
    const rx1 = bakeAll ? range.x1 : Math.min(range.x1, ccx + viewRadius);
    const rz0 = bakeAll ? range.z0 : Math.max(range.z0, ccz - viewRadius);
    const rz1 = bakeAll ? range.z1 : Math.min(range.z1, ccz + viewRadius);
    for (let cz = rz0; cz <= rz1; cz += 1) {
      for (let cx = rx0; cx <= rx1; cx += 1) {
        const distance = Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz));
        const chunkKey = cx + ":" + cz;
        wanted.push({ key: chunkKey, cx, cz, distance, lod: !bakeAll && distance <= nearRadius ? 0 : 1 });
        wantedKeys.add(chunkKey);
      }
    }
    for (const recordKey of Array.from(records.keys())) {
      if (wantedKeys.has(recordKey)) continue;
      const record = records.get(recordKey);
      const distance = Math.max(Math.abs(record.cx - ccx), Math.abs(record.cz - ccz));
      if (bakeAll || distance > viewRadius + 1 || record.cx < range.x0 || record.cx > range.x1 || record.cz < range.z0 || record.cz > range.z1) {
        disposeRecord(recordKey);
      }
    }
    wanted.sort(function (a, b) { return a.distance - b.distance; });
    const maxBuilds = bakeAll ? Infinity : (mode === "game" ? 4 : 12);
    let builds = 0;
    for (const want of wanted) {
      const record = records.get(want.key);
      if (record && record.lod === want.lod && record.revision === revisionOf(want.key)) {
        if (record.distance !== want.distance) {
          record.distance = want.distance;
          syncMaterial(record);
        }
        continue;
      }
      if (builds >= maxBuilds) {
        needsUpdate = true;
        break;
      }
      buildRecord(want);
      builds += 1;
    }
    if (builds) requestRender("terrain-chunks");
    return needsUpdate;
  }

  function setChunkData(key, chunk) {
    if (chunk) heightfield.chunks.set(key, chunk.slice());
    else heightfield.chunks.delete(key);
    heightfield.revision += 1;
    bump(key);
  }

  function loadRefs(nextRefs) {
    const token = ++loadToken;
    const waits = [];
    for (const key of Array.from(heightfield.chunks.keys())) {
      if (!dirty.has(key) && !Object.prototype.hasOwnProperty.call(nextRefs, key)) setChunkData(key, null);
    }
    for (const [key, sha1] of Object.entries(nextRefs)) {
      if (dirty.has(key) || !parseTerrainChunkKey(key)) continue;
      if (refs[key] === sha1 && heightfield.chunks.has(key)) continue;
      if (decoded.has(sha1)) {
        setChunkData(key, decoded.get(sha1));
        continue;
      }
      loading += 1;
      waits.push(fetchChunk(baseUrl, sha1).then(function (chunk) {
        loading = Math.max(0, loading - 1);
        if (token !== loadToken || dirty.has(key) || refs[key] !== sha1) return;
        setChunkData(key, chunk);
        requestRender("terrain-chunk-loaded");
      }));
    }
    refs = Object.assign({}, nextRefs);
    return waits;
  }

  // ---------- verf laden ----------

  function setPaintData(key, layers, data) {
    if (data) paint.chunks.set(key, { layers: [0, 1, 2].map(function (slot) { return String(layers?.[slot] || ""); }), data: data.slice() });
    else {
      paint.chunks.delete(key);
      disposeSplat(key);
    }
    paint.revision += 1;
    paintRevisions.set(key, paintRevisionOf(key) + 1);
    const record = records.get(key);
    if (record) syncMaterial(record);
  }

  function sameLayers(a, b) {
    return [0, 1, 2].every(function (slot) { return String(a?.[slot] || "") === String(b?.[slot] || ""); });
  }

  function loadPaintRefs(nextRefs) {
    const token = loadToken;
    const waits = [];
    for (const key of Array.from(paint.chunks.keys())) {
      if (!paintDirty.has(key) && !Object.prototype.hasOwnProperty.call(nextRefs, key)) setPaintData(key, null, null);
    }
    for (const [key, ref] of Object.entries(nextRefs)) {
      const file = String(ref?.file || "");
      if (paintDirty.has(key) || !parseTerrainChunkKey(key) || !file) continue;
      const old = paintRefs[key];
      if (old && old.file === file && sameLayers(old.layers, ref.layers) && paint.chunks.has(key)) continue;
      if (decodedPaint.has(file)) {
        setPaintData(key, ref.layers, decodedPaint.get(file));
        continue;
      }
      loading += 1;
      waits.push(fetchPaint(baseUrl, file).then(function (data) {
        loading = Math.max(0, loading - 1);
        if (token !== loadToken || paintDirty.has(key) || paintRefs[key]?.file !== file) return;
        setPaintData(key, ref.layers, data);
        requestRender("terrain-paint-loaded");
      }));
    }
    paintRefs = JSON.parse(JSON.stringify(nextRefs));
    return waits;
  }

  function clear() {
    for (const key of Array.from(records.keys())) disposeRecord(key);
    heightfield.chunks.clear();
    heightfield.revision += 1;
    revisions.clear();
    errorCache.clear();
    dirty.clear();
    refs = {};
    config = null;
    bounds = null;
    loadToken += 1;
    loadPromise = Promise.resolve();
    loading = 0;
    paint.chunks.clear();
    paint.revision += 1;
    paintDirty.clear();
    paintRevisions.clear();
    for (const key of Array.from(splatTextures.keys())) disposeSplat(key);
    for (const entry of layerTextures.values()) if (entry.texture) entry.texture.dispose();
    layerTextures.clear();
    paintRefs = {};
    paintTextures = {};
    rockConfig = null;
    setCursor(null);
    if (material?.map) material.map.dispose();
    if (material) material.dispose();
    if (heavyMaterial) heavyMaterial.dispose();
    material = null;
    heavyMaterial = null;
  }

  // world = de wereld uit de server (world.terrain.heightfield + world.ground); look = materiaal van de grond.
  function setWorld(world, look = {}) {
    const nextConfig = world?.terrain?.heightfield || null;
    const nextBounds = nextConfig ? effectiveGroundBounds(world?.ground || null) : null;
    if (!nextConfig || !nextBounds) {
      clear();
      return false;
    }
    const nextGroundY = Number(world?.ground?.y) || 0;
    const nextTexture = look.textureSize || { x: 10, z: 10 };
    const boundsChanged = !bounds || bounds.minX !== nextBounds.minX || bounds.maxX !== nextBounds.maxX || bounds.minZ !== nextBounds.minZ || bounds.maxZ !== nextBounds.maxZ;
    const lookChanged = nextGroundY !== groundY || nextTexture.x !== textureSize.x || nextTexture.z !== textureSize.z;
    config = nextConfig;
    baseUrl = String(nextConfig.baseUrl || "/assets/terrain/");
    bounds = nextBounds;
    groundY = nextGroundY;
    textureSize = { x: Math.max(0.01, Number(nextTexture.x) || 10), z: Math.max(0.01, Number(nextTexture.z) || 10) };
    receiveShadow = look.receiveShadow !== false;
    triBudget = Number(nextConfig.triBudget) > 0 ? Number(nextConfig.triBudget) : TERRAIN_TRI_BUDGET;
    chunkBudget = Number(nextConfig.chunkTriBudget) > 0 ? Number(nextConfig.chunkTriBudget) : TERRAIN_CHUNK_TRI_BUDGET;
    if (look.material && look.material !== material) {
      if (material?.map && material.map !== look.material.map) material.map.dispose();
      if (material) material.dispose();
      if (heavyMaterial) heavyMaterial.dispose();
      material = look.material;
      heavyMaterial = material.clone();
      heavyMaterial.color = material.color.clone().lerp(new THREE.Color("#ff2a2a"), 0.65);
      heavyMaterial.map = material.map;
    }
    if (boundsChanged || lookChanged) {
      for (const key of Array.from(records.keys())) disposeRecord(key);
    }
    const paintConfig = nextConfig.paint && typeof nextConfig.paint === "object" ? nextConfig.paint : {};
    paintTextures = Object.assign({}, paintTextures, paintConfig.textures && typeof paintConfig.textures === "object" ? paintConfig.textures : {});
    rockConfig = paintConfig.rock && paintConfig.rock.texture ? Object.assign({}, paintConfig.rock) : null;
    const waits = loadRefs(nextConfig.chunks && typeof nextConfig.chunks === "object" ? nextConfig.chunks : {});
    waits.push(...loadPaintRefs(paintConfig.chunks && typeof paintConfig.chunks === "object" ? paintConfig.chunks : {}));
    loadPromise = Promise.all(waits);
    syncAllMaterials();
    needsUpdate = true;
    return true;
  }

  // Het materiaal kreeg later zijn textuur (plaatje geladen): heavy-kopie bijwerken.
  function refreshMaterial() {
    if (!material || !heavyMaterial) return;
    heavyMaterial.map = material.map;
    heavyMaterial.needsUpdate = true;
    syncAllMaterials();
  }

  // Editor: verf veranderd in deze vakken (penseel, ongedaan maken).
  function markPaintChanged(keys, options = {}) {
    for (const key of keys || []) {
      paintRevisions.set(key, paintRevisionOf(key) + 1);
      if (!paint.chunks.has(key)) disposeSplat(key);
      if (options.edit !== false) paintDirty.add(key);
      const record = records.get(key);
      if (record) syncMaterial(record);
    }
    paint.revision += 1;
    requestRender("terrain-paint");
  }

  function paintDirtyChunks() {
    return Array.from(paintDirty).sort().map(function (key) {
      const chunk = paint.chunks.get(key) || null;
      return { key, layers: chunk ? chunk.layers.slice() : ["", "", ""], data: chunk ? chunk.data : null };
    });
  }

  // Na opslaan: dit is nu de bewaarde verf. nextRefs = { key: { file, layers } }.
  function commitPaintSaved(nextRefs, saved = {}) {
    for (const [key, ref] of Object.entries(saved || {})) {
      const chunk = paint.chunks.get(key);
      if (chunk && ref?.file) seedTerrainPaint(ref.file, chunk.data);
    }
    paintRefs = JSON.parse(JSON.stringify(nextRefs || {}));
    if (config) config = Object.assign({}, config, { paint: Object.assign({}, config.paint || {}, { chunks: JSON.parse(JSON.stringify(paintRefs)) }) });
    paintDirty.clear();
  }

  // Editor: een textuur die net gekozen is (nog niet in de wereld): { url, size }.
  function definePaintTexture(docKey, info) {
    if (!docKey || !info?.url) return;
    const old = paintTextures[docKey];
    if (old && old.url === info.url && Number(old.size) === Number(info.size)) return;
    paintTextures = Object.assign({}, paintTextures, { [docKey]: { url: String(info.url), size: Number(info.size) || 4 } });
    syncAllMaterials();
  }

  function markChanged(keys, options = {}) {
    for (const key of keys || []) {
      bump(key);
      if (options.edit !== false) dirty.add(key);
      if (options.neighbors) {
        const coord = parseTerrainChunkKey(key);
        if (!coord) continue;
        for (let dz = -1; dz <= 1; dz += 1) {
          for (let dx = -1; dx <= 1; dx += 1) if (dx || dz) bump((coord.cx + dx) + ":" + (coord.cz + dz));
        }
      }
    }
    heightfield.revision += 1;
    if (cursor) placeCursor();
    requestRender("terrain-edit");
  }

  // Niet opgeslagen penseelwerk terugzetten naar wat er bewaard is.
  function discardEdits() {
    const keys = Array.from(dirty);
    dirty.clear();
    for (const key of keys) {
      const sha1 = refs[key];
      if (sha1 && !decoded.has(sha1)) {
        setChunkData(key, null);
        const token = loadToken;
        fetchChunk(baseUrl, sha1).then(function (chunk) {
          if (token !== loadToken || dirty.has(key) || refs[key] !== sha1) return;
          setChunkData(key, chunk);
          requestRender("terrain-chunk-loaded");
        });
      } else {
        setChunkData(key, sha1 ? decoded.get(sha1) : null);
      }
    }
    markChanged(keys, { edit: false, neighbors: true });
    const paintKeys = Array.from(paintDirty);
    paintDirty.clear();
    for (const key of paintKeys) {
      const ref = paintRefs[key];
      if (ref?.file && decodedPaint.has(ref.file)) setPaintData(key, ref.layers, decodedPaint.get(ref.file));
      else if (ref?.file) {
        setPaintData(key, null, null);
        const token = loadToken;
        fetchPaint(baseUrl, ref.file).then(function (data) {
          if (token !== loadToken || paintDirty.has(key) || paintRefs[key]?.file !== ref.file) return;
          setPaintData(key, ref.layers, data);
          requestRender("terrain-paint-loaded");
        });
      } else setPaintData(key, null, null);
    }
    requestRender("terrain-discard");
    return keys;
  }

  function dirtyChunks() {
    return Array.from(dirty).sort().map(function (key) {
      return { key, data: heightfield.chunks.get(key) || null };
    });
  }

  // Na Sluiten: dit zijn nu de bewaarde vakken.
  function commitSaved(nextRefs, savedData = {}) {
    for (const [key, sha1] of Object.entries(savedData)) {
      const chunk = heightfield.chunks.get(key);
      if (chunk) seedTerrainChunk(sha1, chunk);
    }
    refs = Object.assign({}, nextRefs);
    if (config) config = Object.assign({}, config, { chunks: Object.assign({}, nextRefs) });
    dirty.clear();
  }

  function setBakeMode(on) {
    const next = on === true;
    if (next === bakeAll) return;
    bakeAll = next;
    needsUpdate = true;
    syncAllMaterials();
  }

  function setHeavyTint(on) {
    heavyTint = on === true;
    syncAllMaterials();
    requestRender("terrain-heavy-tint");
  }

  function heightAt(x, z) {
    return groundY + terrainHeightAt(heightfield, x, z);
  }

  function raycast(origin, direction) {
    if (!config) return null;
    return raycastTerrain(heightfield, origin, direction, { groundY });
  }

  // Penseel-cirkel op de grond: buitenrand (radius) en binnenrand (waar de zachte rand begint).
  function setCursor(next) {
    if (!next) {
      if (cursor?.line) {
        group.remove(cursor.line);
        cursor.line.geometry.dispose();
        cursor.line.material.dispose();
      }
      cursor = null;
      return;
    }
    if (!cursor) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(129 * 2 * 3), 3));
      const line = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: next.color || "#ffd34d", depthTest: false, transparent: true, opacity: 0.95 }));
      line.renderOrder = 999;
      line.frustumCulled = false;
      group.add(line);
      cursor = { line };
    }
    cursor.x = Number(next.x) || 0;
    cursor.z = Number(next.z) || 0;
    // Stempel en "opslaan als stempel": een rechthoek (breedte, diepte, draaiing in graden).
    cursor.rect = next.shape === "rect" ? { width: Math.max(0.5, Number(next.width) || 1), depth: Math.max(0.5, Number(next.depth) || 1),
      rotation: ((Number(next.rotation) || 0) * Math.PI) / 180 } : null;
    cursor.radius = Math.max(0.5, Number(next.radius) || 8);
    cursor.inner = Math.max(0, Math.min(1, 1 - (Number(next.softness) || 0))) * cursor.radius;
    if (next.color) cursor.line.material.color.set(next.color);
    placeCursor();
  }

  function placeCursor() {
    if (!cursor) return;
    const attribute = cursor.line.geometry.getAttribute("position");
    const array = attribute.array;
    let p = 0;
    const ring = function (radius) {
      for (let i = 0; i < 64; i += 1) {
        for (const step of [i, i + 1]) {
          const angle = (step / 64) * Math.PI * 2;
          const x = cursor.x + Math.cos(angle) * radius;
          const z = cursor.z + Math.sin(angle) * radius;
          array[p++] = x;
          array[p++] = heightAt(x, z) + 0.15;
          array[p++] = z;
        }
      }
    };
    if (cursor.rect) {
      const cos = Math.cos(cursor.rect.rotation);
      const sin = Math.sin(cursor.rect.rotation);
      const hw = cursor.rect.width / 2;
      const hd = cursor.rect.depth / 2;
      const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd], [-hw, -hd]];
      const point = function (u, v) {
        const x = cursor.x + u * cos - v * sin;
        const z = cursor.z + u * sin + v * cos;
        array[p++] = x;
        array[p++] = heightAt(x, z) + 0.15;
        array[p++] = z;
      };
      for (let side = 0; side < 4; side += 1) {
        const [u0, v0] = corners[side];
        const [u1, v1] = corners[side + 1];
        for (let i = 0; i < 32; i += 1) {
          point(u0 + ((u1 - u0) * i) / 32, v0 + ((v1 - v0) * i) / 32);
          point(u0 + ((u1 - u0) * (i + 1)) / 32, v0 + ((v1 - v0) * (i + 1)) / 32);
        }
      }
      attribute.needsUpdate = true;
      cursor.line.geometry.setDrawRange(0, p / 3);
      requestRender("terrain-cursor");
      return;
    }
    ring(cursor.radius);
    ring(Math.max(0.05, cursor.inner));
    attribute.needsUpdate = true;
    cursor.line.geometry.setDrawRange(0, p / 3);
    requestRender("terrain-cursor");
  }

  function stats() {
    let total = 0;
    const chunks = [];
    for (const record of records.values()) {
      total += record.tris;
      chunks.push({ key: record.key, tris: record.tris, nearTris: record.nearTris, lod: record.lod, heavy: record.nearTris > chunkBudget });
    }
    const ccx = Math.floor(centerX / SIZE);
    const ccz = Math.floor(centerZ / SIZE);
    // Wat de game tekent als de speler hier staat: vakken tot 4 ver, dichtbij (1 ver) fijn, de rest grof.
    let game = 0;
    const range = chunkRange();
    if (range) {
      for (let cz = Math.max(range.z0, ccz - GAME_VIEW_RADIUS); cz <= Math.min(range.z1, ccz + GAME_VIEW_RADIUS); cz += 1) {
        for (let cx = Math.max(range.x0, ccx - GAME_VIEW_RADIUS); cx <= Math.min(range.x1, ccx + GAME_VIEW_RADIUS); cx += 1) {
          const info = errorsFor(cx + ":" + cz);
          game += Math.max(Math.abs(cx - ccx), Math.abs(cz - ccz)) <= nearRadius ? info.nearTris : info.farTris;
        }
      }
    }
    const centerRecordKey = ccx + ":" + ccz;
    return {
      game,
      total,
      budget: triBudget,
      chunkBudget,
      chunks,
      heavy: chunks.filter(function (chunk) { return chunk.heavy; }).length,
      visibleChunks: records.size,
      dataChunks: heightfield.chunks.size,
      dirty: new Set(Array.from(dirty).concat(Array.from(paintDirty))).size,
      painted: paint.chunks.size,
      loading,
      center: centerRecordKey
    };
  }

  // Driehoeken van het vak onder een punt (voor de teller "dit vak").
  function chunkInfoAt(x, z) {
    const key = Math.floor(x / SIZE) + ":" + Math.floor(z / SIZE);
    const record = records.get(key);
    const info = errorsFor(key);
    return { key, nearTris: info.nearTris, tris: record ? record.tris : 0, heavy: info.nearTris > chunkBudget, budget: chunkBudget };
  }

  function dispose() {
    clear();
    if (group.parent) group.parent.remove(group);
  }

  return {
    heightfield,
    group,
    get active() { return Boolean(config); },
    get groundY() { return groundY; },
    get bounds() { return bounds; },
    get material() { return material; },
    paintfield: paint,
    setWorld,
    refreshMaterial,
    update,
    markChanged,
    discardEdits,
    dirtyChunks,
    commitSaved,
    setBakeMode,
    setHeavyTint,
    setCursor,
    heightAt,
    raycast,
    stats,
    chunkInfoAt,
    whenLoaded: function () { return loadPromise; },
    isDirty: function () { return dirty.size > 0 || paintDirty.size > 0; },
    markPaintChanged,
    paintDirtyChunks,
    commitPaintSaved,
    definePaintTexture,
    clear,
    dispose
  };
}
