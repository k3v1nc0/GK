// Wereld tekenen (ronde 1): de grond tekenen uit de hoogtekaart (terrain.js), in vakken van 64 x 64 m.
// - Alleen vakken rond de speler (game) of de camera (editor) krijgen een mesh.
// - 2 niveaus: dichtbij fijn (fout max 5 cm), verder weg grof (fout max 50 cm). Vlak = 2 driehoeken.
// - De hoogte zelf (8 KB per vak) wordt voor de hele wereld geladen: lopen en de minimap hebben hem nodig.
// - Een vak heet naar zijn vingerafdruk (sha1) en verandert nooit; de browser bewaart hem dus.
import * as THREE from "three";
import { effectiveGroundBounds } from "./movement-kernel.js";
import {
  TERRAIN_CHUNK_METERS, TERRAIN_LOD_NEAR_ERROR, TERRAIN_LOD_FAR_ERROR, TERRAIN_TRI_BUDGET, TERRAIN_CHUNK_TRI_BUDGET,
  createHeightfield, decodeTerrainChunk, buildTerrainChunkMesh, terrainChunkErrors, countTerrainChunkTriangles,
  terrainHeightAt, raycastTerrain, parseTerrainChunkKey
} from "./terrain.js";

const SIZE = TERRAIN_CHUNK_METERS;
const decoded = new Map();
const pending = new Map();

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
    records.delete(key);
  }

  function materialFor(record) {
    return heavyTint && heavyMaterial && record.nearTris > chunkBudget ? heavyMaterial : material;
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
    record.revision = revisionOf(want.key);
    record.tris = built.triangles;
    record.nearTris = errorInfo.nearTris;
    record.mesh.material = materialFor(record);
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
      if (record && record.lod === want.lod && record.revision === revisionOf(want.key)) continue;
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
    loadPromise = Promise.all(waits);
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
      for (const record of records.values()) record.mesh.material = materialFor(record);
    }
    if (boundsChanged || lookChanged) {
      for (const key of Array.from(records.keys())) disposeRecord(key);
    }
    loadRefs(nextConfig.chunks && typeof nextConfig.chunks === "object" ? nextConfig.chunks : {});
    needsUpdate = true;
    return true;
  }

  // Het materiaal kreeg later zijn textuur (plaatje geladen): heavy-kopie bijwerken.
  function refreshMaterial() {
    if (!material || !heavyMaterial) return;
    heavyMaterial.map = material.map;
    heavyMaterial.needsUpdate = true;
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
  }

  function setHeavyTint(on) {
    heavyTint = on === true;
    for (const record of records.values()) record.mesh.material = materialFor(record);
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
      dirty: dirty.size,
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
    isDirty: function () { return dirty.size > 0; },
    clear,
    dispose
  };
}
