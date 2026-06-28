import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const DEG_TO_RAD = Math.PI / 180;

function colorOrDefault(value, fallback) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "")) ? value : fallback;
}

function assetById(world, id) {
  return (world?.assets || []).find(function (asset) { return asset.id === id; }) || null;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function timingMs(startedAt) {
  return (performance.now() - startedAt).toFixed(1);
}

function disposeObject(object, options = {}) {
  const disposeTextures = options.disposeTextures !== false;
  const disposedTextures = new Set();
  object.traverse(function (child) {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (disposeTextures) {
          for (const value of Object.values(material)) {
            if (value && typeof value.dispose === "function" && value.isTexture && !disposedTextures.has(value)) {
              disposedTextures.add(value);
              value.dispose();
            }
          }
          if (material.uniforms) {
            for (const uniform of Object.values(material.uniforms)) {
              const uval = uniform?.value;
              if (uval && typeof uval.dispose === "function" && uval.isTexture && !disposedTextures.has(uval)) {
                disposedTextures.add(uval);
                uval.dispose();
              }
            }
          }
        }
        material.dispose();
      }
    }
  });
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function colorFromHex(value, fallback) {
  if (value instanceof THREE.Color) return value.clone();
  const fallbackValue = fallback instanceof THREE.Color
    ? "#" + fallback.getHexString()
    : fallback;
  return new THREE.Color(colorOrDefault(value, fallbackValue));
}

function mixColors(primaryHex, secondaryHex, secondaryWeight = 0.25) {
  const color = colorFromHex(primaryHex, secondaryHex);
  color.lerp(colorFromHex(secondaryHex, secondaryHex), clamp(secondaryWeight, 0, 1));
  return color;
}

const TERRAIN_MATERIAL_PRESETS = {
  grass: "#6faa4f",
  sand: "#c8a968",
  stone: "#8f9296",
  mud: "#6b4f3a",
  flowers: "#93b86d",
  village_square: "#b7b0a2"
};

const PATH_TYPE_PRESETS = {
  sand: "#c4a05a",
  stone: "#7a8088",
  dirt: "#7a5230"
};

const WATER_TYPE_PRESETS = {
  river: "#1e8ecf",
  lake: "#1670a8",
  pond: "#268a7a"
};
const SURFACE_KIND_FALLBACK_COLORS = {
  path: "#c8a46e",
  road: "#555555",
  water: "#2f9ecf",
  river: "#1e8fbb",
  mud: "#7a5230",
  lava: "#cc3300",
  snow: "#dde8f0",
  custom: "#888888"
};

const COLLISION_EPSILON = 0.000001;

function safeScale(value) {
  if (!Number.isFinite(value)) return 1;
  if (Math.abs(value) < 0.001) return value < 0 ? -0.001 : 0.001;
  return value;
}

function surfaceScalePair(surface, xKey, yKey, legacyKey) {
  const legacyValue = num(surface?.[legacyKey], 1);
  const fallback = safeScale(legacyValue);
  return {
    x: safeScale(surface?.[xKey] != null ? num(surface[xKey], fallback) : fallback),
    y: safeScale(surface?.[yKey] != null ? num(surface[yKey], fallback) : fallback)
  };
}

function surfaceFloat(value, fallback) {
  const number = num(value, fallback);
  return Number.isFinite(number) ? number : fallback;
}

function terrainPresetColor(materialName) {
  return TERRAIN_MATERIAL_PRESETS[String(materialName || "").trim().toLowerCase()] || TERRAIN_MATERIAL_PRESETS.grass;
}

function pathPresetColor(pathType) {
  return PATH_TYPE_PRESETS[String(pathType || "").trim().toLowerCase()] || PATH_TYPE_PRESETS.sand;
}

function waterPresetColor(waterType) {
  return WATER_TYPE_PRESETS[String(waterType || "").trim().toLowerCase()] || WATER_TYPE_PRESETS.river;
}

function surfaceKindFallbackColor(kind) {
  return SURFACE_KIND_FALLBACK_COLORS[String(kind || "").trim().toLowerCase()] || SURFACE_KIND_FALLBACK_COLORS.path;
}

function normalizeWorldPointList(points) {
  const normalized = [];
  for (const point of Array.isArray(points) ? points : []) {
    const x = Number(point?.x);
    const z = Number(point?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    if (normalized.length) {
      const previous = normalized[normalized.length - 1];
      if (Math.abs(previous.x - x) < 0.000001 && Math.abs(previous.z - z) < 0.000001) continue;
    }
    normalized.push({ x: x, z: z });
  }
  return normalized;
}

function smoothPolyline(points, samplesPerSegment) {
  if (!Array.isArray(points) || points.length < 3) return points;
  const samples = Math.max(2, Math.min(12, num(samplesPerSegment, 8)));
  const result = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < samples; s += 1) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      result.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
      });
    }
  }
  result.push(points[points.length - 1]);
  return result;
}

function createEmptyWalkabilityIndex() {
  return {
    ground: null,
    waters: [],
    surfaceBlockers: [],
    blockers: [],
    walkables: []
  };
}

function normalizeCollisionPointList(points) {
  const normalized = normalizeWorldPointList(points);
  if (normalized.length >= 2) {
    const first = normalized[0];
    const last = normalized[normalized.length - 1];
    if (Math.abs(first.x - last.x) < COLLISION_EPSILON && Math.abs(first.z - last.z) < COLLISION_EPSILON) {
      normalized.pop();
    }
  }
  return normalized;
}

function pointOnSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const abLengthSq = abx * abx + abz * abz;
  if (abLengthSq <= COLLISION_EPSILON) return Math.hypot(px - ax, pz - az) <= COLLISION_EPSILON;
  const apx = px - ax;
  const apz = pz - az;
  const t = clamp((apx * abx + apz * abz) / abLengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, pz - cz) <= COLLISION_EPSILON;
}

function pointInPolygon2D(px, pz, points) {
  if (!Array.isArray(points) || points.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];
    if (pointOnSegment(px, pz, prior.x, prior.z, current.x, current.z)) return true;
    const intersects = ((current.z > pz) !== (prior.z > pz))
      && (px < ((prior.x - current.x) * (pz - current.z)) / ((prior.z - current.z) || COLLISION_EPSILON) + current.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceSquaredToSegment(px, pz, ax, az, bx, bz) {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq <= COLLISION_EPSILON) {
    const dx = px - ax;
    const dz = pz - az;
    return dx * dx + dz * dz;
  }
  const t = clamp(((px - ax) * abx + (pz - az) * abz) / lengthSq, 0, 1);
  const cx = ax + abx * t;
  const cz = az + abz * t;
  const dx = px - cx;
  const dz = pz - cz;
  return dx * dx + dz * dz;
}

function distanceSquaredToPolyline(px, pz, points) {
  if (!Array.isArray(points) || points.length < 2) return Infinity;
  let best = Infinity;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const distanceSq = distanceSquaredToSegment(px, pz, previous.x, previous.z, current.x, current.z);
    if (distanceSq < best) best = distanceSq;
  }
  return best;
}

function pointInAxisAlignedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  return Math.abs(px - centerX) <= halfWidth + COLLISION_EPSILON
    && Math.abs(pz - centerZ) <= halfDepth + COLLISION_EPSILON;
}

function pointInRotatedRectangle(px, pz, rect, inflate = 0) {
  const halfWidth = Math.max(0, num(rect?.width, 0)) / 2 + Math.max(0, num(inflate, 0));
  const halfDepth = Math.max(0, num(rect?.depth, 0)) / 2 + Math.max(0, num(inflate, 0));
  if (halfWidth <= 0 || halfDepth <= 0) return false;
  const rotation = -num(rect?.rotationY, 0) * DEG_TO_RAD;
  const centerX = num(rect?.x, 0);
  const centerZ = num(rect?.z, 0);
  const dx = px - centerX;
  const dz = pz - centerZ;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;
  return Math.abs(localX) <= halfWidth + COLLISION_EPSILON && Math.abs(localZ) <= halfDepth + COLLISION_EPSILON;
}

function normalizeGroundForCollision(ground) {
  const width = Math.max(0, num(ground?.width, 0));
  const depth = Math.max(0, num(ground?.depth, 0));
  const y = num(ground?.y, 0);
  if (width <= 0 || depth <= 0) return null;
  return { width: width, depth: depth, y: y };
}

export function createWalkabilityIndex(worldData) {
  const index = createEmptyWalkabilityIndex();
  index.ground = normalizeGroundForCollision(worldData?.ground);

  const terrain = worldData?.terrain || {};
  const collision = worldData?.collision || {};
  const waters = Array.isArray(terrain.waters) ? terrain.waters : [];
  const surfaces = Array.isArray(terrain.surfaces) ? terrain.surfaces : [];
  const blockers = Array.isArray(collision.blockers) ? collision.blockers : [];
  const walkables = Array.isArray(collision.walkableSurfaces) ? collision.walkableSurfaces : [];

  for (const water of waters) {
    if (water?.blocksPlayer === false) continue;
    const width = Math.max(0, num(water?.width, 0));
    const points = normalizeCollisionPointList(water?.points);
    if (width <= 0 || points.length < 2) continue;
    const waterType = String(water?.waterType || "river").trim().toLowerCase();
    const usesPolygon = (waterType === "lake" || waterType === "pond") && points.length >= 3;
    index.waters.push({
      id: water?.id || null,
      waterType: waterType,
      width: width,
      points: points,
      mode: usesPolygon ? "polygon" : "ribbon"
    });
  }

  for (const surface of surfaces) {
    if (surface?.blocksPlayer !== true) continue;
    const width = Math.max(0, num(surface?.width, 0));
    const points = normalizeCollisionPointList(surface?.points);
    if (width <= 0 || points.length < 2) continue;
    index.surfaceBlockers.push({
      id: surface?.id || surface?.surfaceId || null,
      surfaceKind: String(surface?.surfaceKind || "custom").trim().toLowerCase(),
      width: width,
      points: points,
      mode: "ribbon"
    });
  }

  for (const blocker of blockers) {
    const shapeType = String(blocker?.shapeType || "polygon").trim().toLowerCase();
    const points = normalizeCollisionPointList(blocker?.points);
    const width = Math.max(0, num(blocker?.width, 0));
    const depth = Math.max(0, num(blocker?.depth, 0));
    const radius = Math.max(0, num(blocker?.radius, 0));
    if (shapeType === "polygon") {
      if (points.length < 3) continue;
    } else if (shapeType === "box") {
      if (width <= 0 || depth <= 0) continue;
    } else if (shapeType === "circle") {
      if (radius <= 0) continue;
    } else {
      continue;
    }
    index.blockers.push({
      id: blocker?.id || null,
      shapeType: shapeType,
      x: num(blocker?.x, 0),
      z: num(blocker?.z, 0),
      width: width,
      depth: depth,
      radius: radius,
      points: points,
      reason: blocker?.reason || null
    });
  }

  for (const walkable of walkables) {
    const width = Math.max(0, num(walkable?.width, 0));
    const depth = Math.max(0, num(walkable?.depth, 0));
    if (width <= 0 || depth <= 0) continue;
    index.walkables.push({
      id: walkable?.id || null,
      x: num(walkable?.x, 0),
      y: num(walkable?.y, 0),
      z: num(walkable?.z, 0),
      width: width,
      depth: depth,
      rotationY: num(walkable?.rotationY, 0),
      priority: num(walkable?.priority, 0)
    });
  }

  index.walkables.sort(function (left, right) {
    const priorityDelta = num(right?.priority, 0) - num(left?.priority, 0);
    if (priorityDelta !== 0) return priorityDelta;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  });

  return index;
}

let activeWalkabilityIndex = createEmptyWalkabilityIndex();

function resolveWalkabilitySource(source) {
  if (!source) return activeWalkabilityIndex;
  if (Array.isArray(source.walkables) && Array.isArray(source.blockers) && Array.isArray(source.waters)) return source;
  return activeWalkabilityIndex;
}

export function buildWalkabilityIndex(worldData) {
  activeWalkabilityIndex = createWalkabilityIndex(worldData);
  return activeWalkabilityIndex;
}

export function clearWalkabilityIndex() {
  activeWalkabilityIndex = createEmptyWalkabilityIndex();
  return activeWalkabilityIndex;
}

function countObjectTree(object) {
  let objects = 0;
  let meshes = 0;
  if (!object) return { objects: 0, meshes: 0 };
  object.traverse(function (child) {
    objects += 1;
    if (child.isMesh) meshes += 1;
  });
  return { objects: objects, meshes: meshes };
}

export function isPointOnWalkableSurface(source, x, z) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const walkable of index.walkables) {
    if (pointInRotatedRectangle(x, z, walkable)) return true;
  }
  return false;
}

function isPolygonBlockedAtRadius(points, x, z, radius) {
  if (pointInPolygon2D(x, z, points)) return true;
  const sampleRadius = Math.max(0, num(radius, 0));
  if (sampleRadius <= COLLISION_EPSILON) return false;
  if (pointInPolygon2D(x + sampleRadius, z, points)) return true;
  if (pointInPolygon2D(x - sampleRadius, z, points)) return true;
  if (pointInPolygon2D(x, z + sampleRadius, points)) return true;
  if (pointInPolygon2D(x, z - sampleRadius, points)) return true;
  return false;
}

export function isPointBlockedByBlocker(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const blocker of index.blockers) {
    if (blocker.shapeType === "polygon") {
      if (isPolygonBlockedAtRadius(blocker.points, x, z, radius)) return true;
    } else if (blocker.shapeType === "box") {
      if (pointInAxisAlignedRectangle(x, z, blocker, radius)) return true;
    } else if (blocker.shapeType === "circle") {
      const dx = x - blocker.x;
      const dz = z - blocker.z;
      const limit = blocker.radius + Math.max(0, num(radius, 0));
      if (dx * dx + dz * dz <= limit * limit + COLLISION_EPSILON) return true;
    }
  }
  return false;
}

function isPointBlockedByWaterEntry(water, x, z, radius) {
  if (water.mode === "polygon") {
    return isPolygonBlockedAtRadius(water.points, x, z, radius);
  }
  const halfWidth = (water.width / 2) + Math.max(0, num(radius, 0));
  if (halfWidth <= 0) return false;
  const distanceSq = distanceSquaredToPolyline(x, z, water.points);
  return distanceSq <= halfWidth * halfWidth + COLLISION_EPSILON;
}

export function isPointBlockedByWater(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  for (const water of index.waters) {
    if (isPointBlockedByWaterEntry(water, x, z, radius)) return true;
  }
  return false;
}

function isPointBlockedBySurfaceEntry(surface, x, z, radius) {
  const halfWidth = (surface.width / 2) + Math.max(0, num(radius, 0));
  if (halfWidth <= 0) return false;
  const distanceSq = distanceSquaredToPolyline(x, z, surface.points);
  return distanceSq <= halfWidth * halfWidth + COLLISION_EPSILON;
}

export function isPointBlockedBySurface(source, x, z, radius = 0) {
  const index = resolveWalkabilitySource(source);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const surfaceBlockers = Array.isArray(index.surfaceBlockers) ? index.surfaceBlockers : [];
  for (const surface of surfaceBlockers) {
    if (isPointBlockedBySurfaceEntry(surface, x, z, radius)) return true;
  }
  return false;
}

export function isPointBlockedByTerrain(source, x, z, radius = 0) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const index = resolveWalkabilitySource(source);
  if (isPointOnWalkableSurface(index, x, z)) return false;
  return isPointBlockedByBlocker(index, x, z, radius)
    || isPointBlockedByWater(index, x, z, radius)
    || isPointBlockedBySurface(index, x, z, radius);
}

function clampPointToGround(point, ground, radius) {
  if (!ground) return point;
  const limitX = Math.max(0, num(ground.width, 0) / 2 - radius);
  const limitZ = Math.max(0, num(ground.depth, 0) / 2 - radius);
  if (Number.isFinite(limitX)) point.x = Math.min(limitX, Math.max(-limitX, point.x));
  if (Number.isFinite(limitZ)) point.z = Math.min(limitZ, Math.max(-limitZ, point.z));
  if (Number.isFinite(ground.y)) point.y = ground.y;
  return point;
}

function pushAwayFromSolids(point, radius, solids) {
  if (!Array.isArray(solids) || !solids.length) return point;
  for (const solid of solids) {
    const solidRadius = Math.max(0, num(solid?.radius, 0));
    if (solidRadius <= 0) continue;
    const dx = point.x - num(solid?.x, 0);
    const dz = point.z - num(solid?.z, 0);
    const minDist = radius + solidRadius;
    const dist = Math.hypot(dx, dz);
    if (dist > 0 && dist < minDist) {
      const push = (minDist - dist) / dist;
      point.x += dx * push;
      point.z += dz * push;
    }
  }
  return point;
}

function hasMovedXZ(startX, startZ, x, z) {
  return Math.hypot(x - startX, z - startZ) > COLLISION_EPSILON;
}

function resolveMovementCandidateInto(output, startX, startY, startZ, candidateX, candidateY, candidateZ, index, ground, solids, radius) {
  output.x = Number.isFinite(candidateX) ? candidateX : startX;
  output.y = Number.isFinite(candidateY) ? candidateY : startY;
  output.z = Number.isFinite(candidateZ) ? candidateZ : startZ;
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  pushAwayFromSolids(output, radius, solids);
  clampPointToGround(output, ground, radius);
  if (isPointBlockedByTerrain(index, output.x, output.z, radius)) return false;
  return true;
}

function resolveMovementInto(output, start, desired, options = {}) {
  const index = resolveWalkabilitySource(options.index);
  const radius = Math.max(0, num(options.radius, 0.5));
  const ground = options.ground || index.ground || null;
  const solids = Array.isArray(options.solids) ? options.solids : [];
  const startX = num(start?.x, 0);
  const startY = num(start?.y, 0);
  const startZ = num(start?.z, 0);
  const desiredX = num(desired?.x, startX);
  const desiredY = num(desired?.y, startY);
  const desiredZ = num(desired?.z, startZ);
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, desiredZ, index, ground, solids, radius)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, desiredX, desiredY, startZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  if (resolveMovementCandidateInto(output, startX, startY, startZ, startX, desiredY, desiredZ, index, ground, solids, radius) && hasMovedXZ(startX, startZ, output.x, output.z)) return output;
  output.x = startX;
  output.y = startY;
  output.z = startZ;
  return output;
}

export function resolveMovement(start, desired, options = {}) {
  const result = {
    x: num(start?.x, 0),
    y: num(start?.y, 0),
    z: num(start?.z, 0)
  };
  return resolveMovementInto(result, start, desired, options);
}

export function buildSurfaceStripGeometry(points, options) {
  const halfWidth = Math.max(0, Number(options?.width || 0)) / 2;
  const y = Number(options?.y || 0);
  const uvScale = Math.max(0.001, Number(options?.uvScale || 1));

  if (!Array.isArray(points) || points.length < 2 || halfWidth <= 0) return null;

  const n = points.length;

  // Cumulative arc length for continuous V UV coordinate
  const arcLengths = [0];
  for (let i = 1; i < n; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dz = points[i].z - points[i - 1].z;
    arcLengths.push(arcLengths[i - 1] + Math.hypot(dx, dz));
  }

  const positions = new Float32Array(n * 2 * 3);
  const uvCoords = new Float32Array(n * 2 * 2);
  const indices = [];

  for (let i = 0; i < n; i++) {
    let nx, nz; // miter offset vector (left perpendicular * scale)

    if (i === 0) {
      const dx = points[1].x - points[0].x;
      const dz = points[1].z - points[0].z;
      const len = Math.hypot(dx, dz) || 1;
      nx = (-dz / len) * halfWidth;
      nz = (dx / len) * halfWidth;
    } else if (i === n - 1) {
      const dx = points[n - 1].x - points[n - 2].x;
      const dz = points[n - 1].z - points[n - 2].z;
      const len = Math.hypot(dx, dz) || 1;
      nx = (-dz / len) * halfWidth;
      nz = (dx / len) * halfWidth;
    } else {
      // Miter join: average incoming and outgoing normals, scale to keep strip width
      const dx1 = points[i].x - points[i - 1].x;
      const dz1 = points[i].z - points[i - 1].z;
      const l1 = Math.hypot(dx1, dz1) || 1;
      const dx2 = points[i + 1].x - points[i].x;
      const dz2 = points[i + 1].z - points[i].z;
      const l2 = Math.hypot(dx2, dz2) || 1;
      const n1x = -dz1 / l1;
      const n1z = dx1 / l1;
      const n2x = -dz2 / l2;
      const n2z = dx2 / l2;
      let mx = n1x + n2x;
      let mz = n1z + n2z;
      const mlen = Math.hypot(mx, mz);
      if (mlen < 0.0001) {
        // Nearly 180-degree bend — use incoming normal
        nx = n1x * halfWidth;
        nz = n1z * halfWidth;
      } else {
        mx /= mlen;
        mz /= mlen;
        const dot = mx * n1x + mz * n1z;
        // Clamp miter scale to 2.5x to prevent spikes at sharp bends (bevel-like)
        const scale = Math.min(halfWidth * 2.5, Math.abs(dot) > 0.0001 ? halfWidth / dot : halfWidth * 2.5);
        nx = mx * scale;
        nz = mz * scale;
      }
    }

    const base = i * 2;
    const v = arcLengths[i] / uvScale;

    // Left vertex — U=0
    positions[base * 3] = points[i].x + nx;
    positions[base * 3 + 1] = y;
    positions[base * 3 + 2] = points[i].z + nz;
    uvCoords[base * 2] = 0;
    uvCoords[base * 2 + 1] = v;

    // Right vertex — U=1
    positions[(base + 1) * 3] = points[i].x - nx;
    positions[(base + 1) * 3 + 1] = y;
    positions[(base + 1) * 3 + 2] = points[i].z - nz;
    uvCoords[(base + 1) * 2] = 1;
    uvCoords[(base + 1) * 2 + 1] = v;

    if (i < n - 1) {
      indices.push(base, base + 2, base + 1);
      indices.push(base + 1, base + 2, base + 3);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvCoords, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

function createPolygonShapeGeometry(points) {
  const normalizedPoints = normalizeWorldPointList(points);
  if (normalizedPoints.length < 3) return null;
  if (Math.abs(normalizedPoints[0].x - normalizedPoints[normalizedPoints.length - 1].x) < 0.000001
    && Math.abs(normalizedPoints[0].z - normalizedPoints[normalizedPoints.length - 1].z) < 0.000001) {
    normalizedPoints.pop();
  }
  if (normalizedPoints.length < 3) return null;
  const shape = new THREE.Shape();
  shape.moveTo(normalizedPoints[0].x, normalizedPoints[0].z);
  for (let index = 1; index < normalizedPoints.length; index += 1) {
    shape.lineTo(normalizedPoints[index].x, normalizedPoints[index].z);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}

export function createGkWorldRuntime(canvas, options = {}) {
  const mode = options.mode || "editor";
  const hudElement = options.hud || null;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.info.autoReset = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000000);
  const content = new THREE.Group();
  scene.add(content);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const loader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const modelCache = new Map();
  const textureCache = new Map();
  const entityRoots = new Map();
  const solids = [];
  const animationMixers = new Map();
  const modifierState = { ctrlKey: false };

  let world = null;
  let orbitControls = null;
  let selectionHelper = null;
  let transformGuide = null;
  let terrainEditorOverlay = null;
  let terrainEditorOverlayState = null;
  let terrainRuntimeGroup = null;
  let terrainRuntimeGeneration = 0;
  const terrainTextureRecords = new Map();
  const surfaceMaterialRecords = new Map();
  let waterAnimMaterials = [];
  let surfaceAnimMaterials = [];
  let surfaceDefaultWhiteTex = null;
  let selectedEntityId = null;
  let selectedRoot = null;
  let transformSession = null;
  let onSelectEntity = options.onSelectEntity || function () {};
  let onTransformCommit = options.onTransformCommit || function () {};
  let onTransformEnd = options.onTransformEnd || function () {};
  let onTransformChange = options.onTransformChange || function () {};
  let onModelLoadTiming = options.onModelLoadTiming || function () {};
  const loadErrors = [];
  let editorViewInitialized = false;
  let disposed = false;
  let editorPointerDownHandler = null;
  let editorPointerDownCaptureHandler = null;
  let editorPointerUpCaptureHandler = null;
  let editorContextMenuHandler = null;
  let editorKeyDownHandler = null;
  let editorKeyUpHandler = null;
  let editorDirectPointerMoveHandler = null;
  let editorDirectPointerUpHandler = null;
  let editorDirectMouseMoveHandler = null;
  let editorDirectMouseUpHandler = null;
  let lastEditorPointer = null;
  let viewportPanSession = null;
  let gamePointerDownHandler = null;
  let gameKeyDownHandler = null;
  let gameKeyUpHandler = null;
  let gameWheelHandler = null;
  let rafId = null;
  let renderRequested = false;
  let running = false;
  let resizeRafId = null;
  let resizeObserver = null;
  let windowResizeHandler = null;
  let resizeTarget = canvas.parentElement || canvas;
  let lastResizeWidth = 0;
  let lastResizeHeight = 0;
  let lastResizePixelRatio = 0;
  let loopGeneration = 0;
  let pendingResizeReason = "init";
  let transformState = {
    active: false,
    cancelled: false,
    object: null,
    rootId: null,
    start: null,
    mode: "move",
    axis: null,
    startPointer: null,
    currentPointer: null,
    startPosition: null,
    startRotation: null,
    startScale: null
  };
  let transformDebugState = {
    active: false,
    rootId: null,
    mode: "move",
    axis: null,
    dx: 0,
    dy: 0,
    changed: false,
    previews: 0,
    lastInputAt: 0
  };
  let transformAxisConstraint = null;
  let snapState = {
    mode: "off",
    gridSize: 1
  };
  let localViewActive = false;
  let previewAnimations = false;
  const DEBUG_RUNTIME = window.__GK_DEBUG_RUNTIME && typeof window.__GK_DEBUG_RUNTIME === "object"
    ? window.__GK_DEBUG_RUNTIME
    : { enabled: false, activeLoopCount: 0, running: false, resizeCount: 0, renderCount: 0, lastRenderReasons: [], lastResizeSnapshot: null, activeResizeHandlers: 0 };
  window.__GK_DEBUG_RUNTIME = DEBUG_RUNTIME;
  let lastTime = performance.now();

  // Game state
  const player = { root: null, pos: new THREE.Vector3(), facing: 0, radius: 0.5, speed: 6, sprint: 1.6, turnSpeed: 600 };
  let camYaw = 0;
  let camPitch = 60;
  let camDistance = 20;
  let camMinDistance = 1;
  let camMaxDistance = 500;
  let camFollow = true;
  let camRotateSpeed = 90;
  const camTarget = new THREE.Vector3();
  let clickTarget = null;
  const pressedKeys = new Set();
  const keyToAction = new Map();
  const moveVector = new THREE.Vector3();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const movementTarget = new THREE.Vector3();
  const interactables = [];
  let activeInteractable = null;
  let hudModules = [];
  const hudNodes = { prompt: null, anchored: new Map(), performance: new Map() };
  const rendererLabel = renderer.capabilities?.isWebGL2 ? "WebGL2" : "WebGL1";
  const runtimeStats = {
    sceneObjects: 0,
    meshes: 0,
    terrainVisuals: 0,
    terrainLayers: 0,
    terrainPaths: 0,
    terrainWaters: 0,
    terrainSurfaces: 0,
    collisionShapes: 0,
    entities: 0,
    interactables: 0
  };
  let perfHudNextUpdateAt = 0;
  let perfHudFrameMs = 0;
  let perfHudWarmup = false;

  if (mode === "editor") {
    orbitControls = new OrbitControls(camera, canvas);
    orbitControls.enableDamping = false;
    orbitControls.dampingFactor = 0.08;
    orbitControls.screenSpacePanning = true;
    orbitControls.minPolarAngle = 0.001;
    orbitControls.maxPolarAngle = Math.PI - 0.001;
    updateOrbitMouseMapping();
    orbitControls.enableKeys = false;
    orbitControls.addEventListener("change", requestRender);
    selectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x7bd4ff);
    selectionHelper.visible = false;
    selectionHelper.material.depthTest = false;
    selectionHelper.material.depthWrite = false;
    selectionHelper.material.transparent = true;
    selectionHelper.material.opacity = 0.9;
    selectionHelper.material.toneMapped = false;
    selectionHelper.renderOrder = 999;
    selectionHelper.raycast = function () {};
    scene.add(selectionHelper);
    transformGuide = createTransformGuide();
    scene.add(transformGuide);
    terrainEditorOverlay = createTerrainOverlay();
    scene.add(terrainEditorOverlay);
    editorPointerDownCaptureHandler = function (event) {
      if (!orbitControls) return;
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) return;
      if (transformSession) {
        if (event.button === 2) {
          event.preventDefault();
          event.stopImmediatePropagation();
          cancelTransform();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.button === 1 && event.shiftKey && !transformState.active) {
        if (beginViewportPan(event)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
      }
      if (event.button === 1) updateOrbitMouseMapping(event.ctrlKey || event.metaKey);
    };
    editorContextMenuHandler = function (event) {
      event.preventDefault();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      if (transformSession) cancelTransform();
    };
    editorKeyDownHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = true;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
    };
    editorKeyUpHandler = function (event) {
      if (event.key === "Control" || event.key === "Meta") {
        modifierState.ctrlKey = false;
        updateOrbitMouseMapping();
        applyTransformSnapState();
      }
    };
    canvas.addEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    canvas.addEventListener("contextmenu", editorContextMenuHandler);
    window.addEventListener("keydown", editorKeyDownHandler);
    window.addEventListener("keyup", editorKeyUpHandler);
    editorDirectPointerMoveHandler = handleTransformPointerMove;
    editorDirectPointerUpHandler = handleTransformPointerUp;
    editorDirectMouseMoveHandler = handleTransformPointerMove;
    editorDirectMouseUpHandler = handleTransformPointerUp;
    canvas.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    canvas.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    canvas.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    window.addEventListener("pointermove", editorDirectPointerMoveHandler, true);
    window.addEventListener("pointerup", editorDirectPointerUpHandler, true);
    window.addEventListener("pointercancel", editorDirectPointerUpHandler, true);
    canvas.addEventListener("mousemove", editorDirectMouseMoveHandler, true);
    canvas.addEventListener("mouseup", editorDirectMouseUpHandler, true);
    window.addEventListener("mousemove", editorDirectMouseMoveHandler, true);
    window.addEventListener("mouseup", editorDirectMouseUpHandler, true);
    editorPointerUpCaptureHandler = function (event) {
      rememberEditorPointer(event);
      if (viewportPanSession && event.pointerId === viewportPanSession.pointerId) {
        handleViewportPanUp(event);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (event.button !== 1) return;
      updateOrbitMouseMapping();
    };
    canvas.addEventListener("pointerup", editorPointerUpCaptureHandler, true);
    canvas.addEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    editorPointerDownHandler = function (event) {
      rememberEditorPointer(event);
      if (event.button !== 0) return;
      if (transformSession) return;
      const entityId = pickEntity(event);
      if (entityId) {
        selectEntity(entityId);
        onSelectEntity(entityId);
      }
    };
    canvas.addEventListener("pointerdown", editorPointerDownHandler);
  } else {
    buildHud();
    gamePointerDownHandler = function (event) {
      if (event.button !== 0) return;
      const inter = pickInteractable(event);
      if (inter) { triggerInteractable(inter); return; }
      const ground = screenToGround(event.clientX, event.clientY);
      if (ground) { clickTarget = new THREE.Vector3(ground.x, player.pos.y, ground.z); pressedKeys.clear(); }
    };
    canvas.addEventListener("pointerdown", gamePointerDownHandler);
    gameKeyDownHandler = function (event) {
      pressedKeys.add(event.code);
      const action = keyToAction.get(event.code);
      if (action === "interact" && activeInteractable) { triggerInteractable(activeInteractable); event.preventDefault(); }
      if (action === "cancel") clickTarget = null;
      if (action === "zoom_in") setZoom(camDistance - 2);
      if (action === "zoom_out") setZoom(camDistance + 2);
      if (movementActionFor(event.code)) clickTarget = null;
    };
    gameKeyUpHandler = function (event) { pressedKeys.delete(event.code); };
    gameWheelHandler = function (event) {
      event.preventDefault();
      setZoom(camDistance + Math.sign(event.deltaY) * 2);
    };
    window.addEventListener("keydown", gameKeyDownHandler);
    window.addEventListener("keyup", gameKeyUpHandler);
    canvas.addEventListener("wheel", gameWheelHandler, { passive: false });
  }

  function movementActionFor(code) {
    const action = keyToAction.get(code);
    return action === "move_forward" || action === "move_back" || action === "move_left" || action === "move_right";
  }

  function updateOrbitMouseMapping(forceCtrl) {
    if (!orbitControls) return;
    if (forceCtrl !== undefined) modifierState.ctrlKey = Boolean(forceCtrl);
    orbitControls.mouseButtons.LEFT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.RIGHT = THREE.MOUSE.NONE;
    orbitControls.mouseButtons.MIDDLE = modifierState.ctrlKey ? THREE.MOUSE.DOLLY : THREE.MOUSE.ROTATE;
  }

  function rememberEditorPointer(event) {
    if (!event || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
    lastEditorPointer = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId
    };
  }

  function pointerFromClientPoint(clientX, clientY, buttonOverride) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      y: -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
      button: buttonOverride !== undefined ? buttonOverride : 0
    };
  }

  function configureCallbacks(callbacks) {
    onSelectEntity = callbacks.onSelectEntity || onSelectEntity;
    onTransformCommit = callbacks.onTransformCommit || onTransformCommit;
    onTransformEnd = callbacks.onTransformEnd || onTransformEnd;
    onTransformChange = callbacks.onTransformChange || onTransformChange;
    onModelLoadTiming = callbacks.onModelLoadTiming || onModelLoadTiming;
  }

  function updateDebugLoopState() {
    DEBUG_RUNTIME.activeLoopCount = rafId !== null || running ? 1 : 0;
    DEBUG_RUNTIME.running = running;
    DEBUG_RUNTIME.loopGeneration = loopGeneration;
  }

  function pushRenderReason(reason) {
    const entry = reason || "render";
    DEBUG_RUNTIME.lastRenderReasons.unshift(entry);
    if (DEBUG_RUNTIME.lastRenderReasons.length > 12) DEBUG_RUNTIME.lastRenderReasons.length = 12;
  }

  function requestRender(reason) {
    if (disposed) return;
    renderRequested = true;
    pushRenderReason(reason);
    if (rafId === null) startRenderLoop(reason);
  }

  function startRenderLoop(reason) {
    if (disposed || rafId !== null) return;
    running = true;
    loopGeneration += 1;
    lastTime = performance.now();
    updateDebugLoopState();
    rafId = requestAnimationFrame(renderFrame);
    if (reason) DEBUG_RUNTIME.lastStartReason = reason;
  }

  function stopRenderLoop(reason) {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    running = false;
    renderRequested = false;
    updateDebugLoopState();
    if (reason) DEBUG_RUNTIME.lastStopReason = reason;
  }

  function handleResize(reason) {
    if (disposed) return false;
    const rect = resizeTarget && typeof resizeTarget.getBoundingClientRect === "function"
      ? resizeTarget.getBoundingClientRect()
      : null;
    const width = Math.max(0, Math.floor(rect ? rect.width : canvas.clientWidth));
    const height = Math.max(0, Math.floor(rect ? rect.height : canvas.clientHeight));
    if (width <= 0 || height <= 0) return false;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === lastResizeWidth && height === lastResizeHeight && ratio === lastResizePixelRatio) return false;
    const beforePosition = DEBUG_RUNTIME.enabled ? camera.position.clone() : null;
    const beforeTarget = DEBUG_RUNTIME.enabled && orbitControls ? orbitControls.target.clone() : null;
    lastResizeWidth = width;
    lastResizeHeight = height;
    lastResizePixelRatio = ratio;
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    DEBUG_RUNTIME.resizeCount += 1;
    if (DEBUG_RUNTIME.enabled && beforePosition) {
      const afterPosition = camera.position.clone();
      const afterTarget = orbitControls ? orbitControls.target.clone() : null;
      DEBUG_RUNTIME.lastResizeSnapshot = {
        reason: reason || "resize",
        before: {
          position: { x: beforePosition.x, y: beforePosition.y, z: beforePosition.z },
          target: beforeTarget ? { x: beforeTarget.x, y: beforeTarget.y, z: beforeTarget.z } : null
        },
        after: {
          position: { x: afterPosition.x, y: afterPosition.y, z: afterPosition.z },
          target: afterTarget ? { x: afterTarget.x, y: afterTarget.y, z: afterTarget.z } : null
        }
      };
      if (beforePosition.distanceTo(afterPosition) > 0.0001 || (beforeTarget && afterTarget && beforeTarget.distanceTo(afterTarget) > 0.0001)) {
        DEBUG_RUNTIME.lastResizeSnapshot.warning = "camera position/target changed unexpectedly";
      }
    }
    requestRender(reason || "resize");
    return true;
  }

  function scheduleResize(reason) {
    if (disposed) return;
    pendingResizeReason = reason || "resize";
    if (resizeRafId !== null) return;
    resizeRafId = requestAnimationFrame(function () {
      resizeRafId = null;
      handleResize(pendingResizeReason);
    });
  }

  function renderFrame(time) {
    renderRequested = false;
    rafId = null;
    running = true;
    updateDebugLoopState();
    if (disposed) {
      running = false;
      updateDebugLoopState();
      return;
    }
    DEBUG_RUNTIME.renderCount += 1;
    const frameMs = Math.max(0, Math.min(1000, time - lastTime));
    const delta = Math.min(0.05, frameMs / 1000);
    lastTime = time;
    perfHudFrameMs = perfHudWarmup ? perfHudFrameMs * 0.85 + frameMs * 0.15 : frameMs;
    perfHudWarmup = true;
    const shouldAnimateModels = mode === "game" || (mode === "editor" && previewAnimations && animationMixers.size > 0);
    const shouldAnimateSurfaces = surfaceAnimMaterials.length > 0 && (mode === "game" || mode === "editor");
    const shouldAnimate = shouldAnimateModels || shouldAnimateSurfaces;
    if (shouldAnimateModels) {
      for (const { mixer } of animationMixers.values()) {
        mixer.update(delta);
      }
    }
    if (selectionHelper?.visible) selectionHelper.update();
    if (transformGuide?.visible) updateTransformGuide();
    if (mode === "game") updatePlayer(delta);
    if (waterAnimMaterials.length > 0 && mode === "game") updateWaterAnimation(time);
    if (shouldAnimateSurfaces) updateSurfaceAnimation(time);
    renderer.render(scene, camera);
    if (mode === "game") updatePerformanceHud(time);
    running = false;
    updateDebugLoopState();
    if (mode === "game") {
      startRenderLoop("game");
    } else if (shouldAnimate) {
      startRenderLoop("preview");
    } else if (renderRequested) {
      startRenderLoop("follow-up");
    }
  }

  function clearContent() {
    clearTerrainEditorOverlay();
    clearTerrainRuntimeVisuals();
    clearWalkabilityIndex();
    resetRuntimeStats();
    viewportPanSession = null;
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    transformState.startPointer = null;
    transformState.currentPointer = null;
    if (selectionHelper) selectionHelper.visible = false;
    if (selectionHelper) selectionHelper.object = null;
    if (transformGuide) transformGuide.visible = false;
    if (orbitControls) orbitControls.enabled = true;
    for (const { mixer, root } of animationMixers.values()) {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    animationMixers.clear();
    for (const child of Array.from(content.children)) {
      content.remove(child);
      disposeObject(child, { disposeTextures: false });
    }
    entityRoots.clear();
    solids.length = 0;
    interactables.length = 0;
    activeInteractable = null;
    player.root = null;
    loadErrors.length = 0;
    perfHudNextUpdateAt = 0;
    perfHudFrameMs = 0;
    perfHudWarmup = false;
  }

  function captureViewState() {
    if (mode !== "editor") return null;
    return {
      cameraPosition: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      cameraTarget: orbitControls ? { x: orbitControls.target.x, y: orbitControls.target.y, z: orbitControls.target.z } : null,
      selectedEntityId: selectedEntityId,
      gizmoMode: transformState.mode === "move" ? "translate" : (transformState.mode || "translate"),
      localViewActive: localViewActive
    };
  }

  function restoreViewState(viewState) {
    if (mode !== "editor" || !viewState) return false;
    if (orbitControls && viewState.cameraPosition && viewState.cameraTarget) {
      camera.position.set(viewState.cameraPosition.x, viewState.cameraPosition.y, viewState.cameraPosition.z);
      orbitControls.target.set(viewState.cameraTarget.x, viewState.cameraTarget.y, viewState.cameraTarget.z);
      orbitControls.update();
    }
    selectedEntityId = viewState.selectedEntityId || null;
    refreshSelectedRootReference();
    if (viewState.gizmoMode) {
      transformState.mode = viewState.gizmoMode === "translate" ? "move" : viewState.gizmoMode;
    }
    transformSession = null;
    transformAxisConstraint = null;
    localViewActive = Boolean(viewState.localViewActive);
    applyLocalView();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function rootForSelectableId(entityId) {
    if (!entityId) return null;
    if (entityRoots.has(entityId)) return entityRoots.get(entityId) || null;
    if (player.root?.userData?.playerId === entityId) return player.root;
    return null;
  }

  function refreshSelectedRootReference() {
    if (!selectedEntityId) {
      selectedRoot = null;
      return null;
    }
    const freshRoot = rootForSelectableId(selectedEntityId);
    selectedRoot = freshRoot || null;
    if (!freshRoot) selectedEntityId = null;
    return freshRoot;
  }

  function selectableIdForObject(object) {
    if (!object) return null;
    return object.userData?.entityId || object.userData?.playerId || null;
  }

  function selectedObjectRoot() {
    return refreshSelectedRootReference();
  }

  function createTransformGuide() {
    const guide = new THREE.Group();
    guide.name = "GK editor transform guide";
    guide.visible = false;
    guide.renderOrder = 1000;
    const axes = [
      { name: "X", color: 0xff5a5f, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)] },
      { name: "Y", color: 0x78d87b, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)] },
      { name: "Z", color: 0x66aaff, points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)] }
    ];
    for (const axis of axes) {
      const geometry = new THREE.BufferGeometry().setFromPoints(axis.points);
      const material = new THREE.LineBasicMaterial({
        color: axis.color,
        depthTest: false,
        depthWrite: false,
        transparent: true,
        opacity: 0.95,
        toneMapped: false
      });
      const line = new THREE.Line(geometry, material);
      line.name = "GK editor transform guide " + axis.name;
      line.renderOrder = 1000;
      line.raycast = function () {};
      guide.add(line);
    }
    guide.traverse(function (child) {
      child.raycast = function () {};
    });
    return guide;
  }

  function terrainOverlayColorForNode(nodeType) {
    if (nodeType === "water_layer") return 0x43b4ff;
    if (nodeType === "walkable_surface") return 0x8fe0a8;
    if (nodeType === "blocker_area") return 0xf0b35a;
    return 0xf0b35a;
  }

  function createTerrainOverlay() {
    const group = new THREE.Group();
    group.name = "GK editor terrain overlay";
    group.visible = false;
    group.renderOrder = 2000;
    group.frustumCulled = false;
    return group;
  }

  function terrainOverlayLine(points, closed, color, opacity = 0.95) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: opacity,
      toneMapped: false
    });
    const line = closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material);
    line.renderOrder = 2000;
    line.frustumCulled = false;
    line.name = "GK terrain overlay line";
    line.raycast = function () {};
    return line;
  }

  function terrainOverlayHandle(position, color, role, nodeId, pointIndex, selected) {
    const geometry = new THREE.SphereGeometry(selected ? 0.18 : 0.14, 10, 8);
    const material = new THREE.MeshBasicMaterial({
      color: selected ? 0xffffff : color,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: selected ? 1 : 0.96,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.renderOrder = 2001;
    mesh.frustumCulled = false;
    mesh.name = "GK terrain overlay handle";
    mesh.userData.terrainHandle = true;
    mesh.userData.nodeId = nodeId;
    mesh.userData.handleRole = role;
    mesh.userData.pointIndex = Number.isInteger(pointIndex) ? pointIndex : null;
    mesh.userData.selected = Boolean(selected);
    return mesh;
  }

  function terrainOverlayRectanglePoints(state) {
    const halfWidth = Math.max(0, num(state?.width, 0)) / 2;
    const halfDepth = Math.max(0, num(state?.depth, 0)) / 2;
    const rotation = num(state?.rotationY, 0) * DEG_TO_RAD;
    const center = new THREE.Vector3(num(state?.x, 0), num(state?.y, 0), num(state?.z, 0));
    const offsets = [
      new THREE.Vector3(-halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, -halfDepth),
      new THREE.Vector3(halfWidth, 0, halfDepth),
      new THREE.Vector3(-halfWidth, 0, halfDepth)
    ];
    for (const offset of offsets) offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(center);
    return offsets;
  }

  function terrainOverlayCirclePoints(state, segments = 24) {
    const radius = Math.max(0, num(state?.radius, 0));
    const center = new THREE.Vector3(num(state?.x, 0), num(state?.y, 0), num(state?.z, 0));
    const points = [];
    for (let index = 0; index < Math.max(8, segments); index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(8, segments);
      points.push(new THREE.Vector3(center.x + Math.cos(angle) * radius, center.y, center.z + Math.sin(angle) * radius));
    }
    return points;
  }

  function clearTerrainEditorOverlay() {
    if (!terrainEditorOverlay) return;
    if (!terrainEditorOverlay.visible && terrainEditorOverlay.children.length === 0) {
      terrainEditorOverlayState = null;
      return;
    }
    terrainEditorOverlayState = null;
    terrainEditorOverlay.visible = false;
    for (const child of Array.from(terrainEditorOverlay.children)) {
      terrainEditorOverlay.remove(child);
      disposeObject(child);
    }
    requestRender("terrain-overlay-clear");
  }

  function buildTerrainEditorOverlay(nextOverlay) {
    if (!terrainEditorOverlay || mode !== "editor") return;
    clearTerrainEditorOverlay();
    if (!nextOverlay || !nextOverlay.nodeType) return;
    terrainEditorOverlayState = nextOverlay;
    terrainEditorOverlay.visible = true;
    const nodeId = String(nextOverlay.nodeId || "");
    const nodeType = String(nextOverlay.nodeType || "");
    const color = terrainOverlayColorForNode(nodeType);
    const lineColor = nextOverlay.color ? new THREE.Color(nextOverlay.color) : new THREE.Color(color);
    const y = nodeType === "walkable_surface"
      ? num(nextOverlay.y, 0)
      : num(nextOverlay.groundY, 0) + 0.03;
    const selectedIndex = Number.isInteger(nextOverlay.selectedPointIndex) ? nextOverlay.selectedPointIndex : null;
    const selectedIndices = Array.isArray(nextOverlay.selectedPointIndices) ? new Set(nextOverlay.selectedPointIndices) : null;
    const selectedRole = String(nextOverlay.selectedHandleRole || "");

    if (nodeType === "walkable_surface") {
      const points = terrainOverlayRectanglePoints(nextOverlay);
      const line = terrainOverlayLine(points, true, lineColor, 0.92);
      if (line) terrainEditorOverlay.add(line);
      const center = terrainOverlayHandle(
        new THREE.Vector3(num(nextOverlay.x, 0), num(nextOverlay.y, 0), num(nextOverlay.z, 0)),
        color,
        "center",
        nodeId,
        null,
        selectedRole === "center"
      );
      terrainEditorOverlay.add(center);
      requestRender("terrain-overlay-update");
      return;
    }

    const rawPoints = Array.isArray(nextOverlay.points) ? nextOverlay.points : [];
    const points = [];
    for (const point of rawPoints) {
      const x = Number(point?.x);
      const z = Number(point?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      points.push(new THREE.Vector3(x, y, z));
    }
    const extrudePreviewPoint = nextOverlay.draggingHandleRole === "extrude" && nextOverlay.previewPoint
      ? new THREE.Vector3(
        Number(nextOverlay.previewPoint.x) || 0,
        y,
        Number(nextOverlay.previewPoint.z) || 0
      )
      : null;
    const extrudePreviewIndex = Number.isInteger(nextOverlay.previewInsertIndex)
      ? Math.max(0, Math.min(points.length, nextOverlay.previewInsertIndex))
      : Math.max(0, points.length - 1);
    if (extrudePreviewPoint) points.splice(extrudePreviewIndex, 0, extrudePreviewPoint);

    const isPointSelected = function (index) {
      if (extrudePreviewPoint && index === extrudePreviewIndex) return true;
      if (selectedIndices && selectedIndices.size > 0) return selectedIndices.has(index);
      return index === selectedIndex;
    };

    if (nodeType === "blocker_area" && String(nextOverlay.shapeType || "").toLowerCase() === "polygon") {
      const line = terrainOverlayLine(points, points.length >= 3, lineColor, 0.9);
      if (line) terrainEditorOverlay.add(line);
      for (let index = 0; index < points.length; index += 1) {
        terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
      }
      requestRender("terrain-overlay-update");
      return;
    }

    if (nodeType === "path_layer" || nodeType === "water_layer" || nodeType === "surface_layer") {
      const line = terrainOverlayLine(points, false, lineColor, 0.95);
      if (line) terrainEditorOverlay.add(line);
      for (let index = 0; index < points.length; index += 1) {
        terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
      }
      requestRender("terrain-overlay-update");
      return;
    }

    if (nodeType === "blocker_area") {
      const shapeType = String(nextOverlay.shapeType || "").toLowerCase();
      if (shapeType === "box") {
        const boxPoints = terrainOverlayRectanglePoints({
          x: nextOverlay.x,
          y: num(nextOverlay.groundY, 0) + 0.03,
          z: nextOverlay.z,
          width: nextOverlay.width,
          depth: nextOverlay.depth,
          rotationY: 0
        });
        const line = terrainOverlayLine(boxPoints, true, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
      } else if (shapeType === "circle") {
        const circlePoints = terrainOverlayCirclePoints({
          x: nextOverlay.x,
          y: num(nextOverlay.groundY, 0) + 0.03,
          z: nextOverlay.z,
          radius: nextOverlay.radius
        });
        const line = terrainOverlayLine(circlePoints, true, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
      } else {
        const line = terrainOverlayLine(points, points.length >= 3, lineColor, 0.85);
        if (line) terrainEditorOverlay.add(line);
        for (let index = 0; index < points.length; index += 1) {
          terrainEditorOverlay.add(terrainOverlayHandle(points[index], color, "point", nodeId, index, isPointSelected(index)));
        }
      }
      requestRender("terrain-overlay-update");
      return;
    }

    requestRender("terrain-overlay-update");
  }

  function setTerrainEditorOverlay(nextOverlay) {
    if (mode !== "editor" || !terrainEditorOverlay) return;
    if (!nextOverlay) {
      clearTerrainEditorOverlay();
      return;
    }
    buildTerrainEditorOverlay(nextOverlay);
  }

  function ensureTerrainRuntimeGroup() {
    if (terrainRuntimeGroup) return terrainRuntimeGroup;
    terrainRuntimeGroup = new THREE.Group();
    terrainRuntimeGroup.name = "GK runtime terrain visuals";
    terrainRuntimeGroup.frustumCulled = false;
    scene.add(terrainRuntimeGroup);
    runtimeStats.sceneObjects += 1;
    return terrainRuntimeGroup;
  }

  function clearTerrainRuntimeVisuals() {
    terrainRuntimeGeneration += 1;
    terrainTextureRecords.clear();
    surfaceMaterialRecords.clear();
    waterAnimMaterials = [];
    surfaceAnimMaterials = [];
    surfaceDefaultWhiteTex = null;
    if (!terrainRuntimeGroup) return;
    if (terrainRuntimeGroup.parent) terrainRuntimeGroup.parent.remove(terrainRuntimeGroup);
    disposeObject(terrainRuntimeGroup, { disposeTextures: true });
    terrainRuntimeGroup = null;
  }

  function requestTerrainTexture(asset, applyTexture, repeatX, repeatZ) {
    if (!asset?.sourcePath || !["texture", "image"].includes(asset.assetType)) return false;
    const existing = terrainTextureRecords.get(asset.id);
    if (existing?.status === "ready" && existing.texture) {
      if (typeof applyTexture === "function") applyTexture(existing.texture);
      return true;
    }
    if (existing?.status === "loading") {
      if (typeof applyTexture === "function") existing.waiters.push(applyTexture);
      return true;
    }
    const record = {
      status: "loading",
      texture: null,
      waiters: typeof applyTexture === "function" ? [applyTexture] : [],
      repeatX: Math.max(1, num(repeatX, 1)),
      repeatZ: Math.max(1, num(repeatZ, 1)),
      generation: terrainRuntimeGeneration
    };
    terrainTextureRecords.set(asset.id, record);
    try {
      textureLoader.load(asset.sourcePath, function (texture) {
        if (record.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== record) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(record.repeatX, record.repeatZ);
        record.status = "ready";
        record.texture = texture;
        for (const waiter of record.waiters.splice(0)) waiter(texture);
        requestRender("terrain-texture-loaded");
      }, undefined, function () {
        if (record.generation !== terrainRuntimeGeneration || disposed || terrainTextureRecords.get(asset.id) !== record) return;
        record.status = "error";
        loadErrors.push("Terrain texture: " + (asset.name || asset.id));
        renderHud();
      });
    } catch (error) {
      record.status = "error";
      loadErrors.push("Terrain texture: " + (asset.name || asset.id));
      renderHud();
      console.warn("Terrain texture load failed for " + (asset.name || asset.id) + ".", error);
      return false;
    }
    return true;
  }

  function createOverlayMaterial(color, opacity, options = {}) {
    const alpha = clamp(num(opacity, 1), 0, 1);
    const material = new THREE.MeshBasicMaterial({
      color: color instanceof THREE.Color ? color : colorFromHex(color, "#ffffff"),
      transparent: alpha < 0.999,
      opacity: alpha,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      toneMapped: false
    });
    material.fog = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = num(options.polygonOffsetFactor, -1);
    material.polygonOffsetUnits = num(options.polygonOffsetUnits, -1);
    if (options.map) material.map = options.map;
    return material;
  }

  function addTerrainRuntimeMesh(mesh) {
    if (!mesh) return;
    const group = ensureTerrainRuntimeGroup();
    group.add(mesh);
    runtimeStats.sceneObjects += 1;
    runtimeStats.meshes += 1;
    runtimeStats.terrainVisuals += 1;
  }

  function updateWaterAnimation(time) {
    for (const entry of waterAnimMaterials) {
      const phase = (time * 0.001 * entry.flowSpeed * 0.8) % (Math.PI * 2);
      const pulse = Math.sin(phase) * 0.04;
      entry.material.color.setHSL(entry.baseH, entry.baseS, clamp(entry.baseL + pulse, 0.1, 0.9));
    }
  }

  function updateSurfaceAnimation(time) {
    const t = time * 0.001;
    for (const entry of surfaceAnimMaterials) {
      const uniforms = entry?.uniforms || null;
      if (!uniforms) continue;
      if (uniforms.time) uniforms.time.value = t;
      const material = entry.material || null;
      const map = material?.map || null;
      const flowMain = num(uniforms.flowMain?.value, 0);
      const flowSpeed = num(uniforms.flowSpeed?.value, 0);
      if (!map || flowMain <= 0 || flowSpeed === 0) continue;
      if (entry.mainMap !== map) {
        entry.mainMap = map;
        entry.baseMainOffset.set(map.offset.x, map.offset.y);
      }
      const flowDir = uniforms.flowDir?.value || null;
      const flowX = num(flowDir?.x, 0);
      const flowY = num(flowDir?.y, 1);
      map.offset.set(
        entry.baseMainOffset.x + flowX * t * flowSpeed,
        entry.baseMainOffset.y + flowY * t * flowSpeed
      );
    }
  }

  function surfaceTextureScaleVector(surface, xKey, yKey, legacyKey) {
    const pair = surfaceScalePair(surface, xKey, yKey, legacyKey);
    return new THREE.Vector2(pair.x, pair.y);
  }

  function cloneSurfaceTextureUniform(texture, hasTextureUniform) {
    if (texture && hasTextureUniform && hasTextureUniform.value > 0.5) {
      return texture;
    }
    return getOrCreateSurfaceDefaultWhiteTex();
  }

  function updateSurfaceMaterialUniforms(material, patch = {}) {
    const uniforms = material?.userData?.surfaceUniforms || null;
    if (!uniforms) return;
    const surface = patch || {};
    if (surface.textureScaleX !== undefined || surface.textureScaleY !== undefined || surface.textureScale !== undefined) {
      const main = surfaceTextureScaleVector(surface, "textureScaleX", "textureScaleY", "textureScale");
      uniforms.mainScale.value.set(main.x, main.y);
      if (material.map) {
        material.map.repeat.set(main.x, main.y);
        material.map.needsUpdate = true;
      }
    }
    if (surface.secondaryTextureScaleX !== undefined || surface.secondaryTextureScaleY !== undefined || surface.secondaryTextureScale !== undefined) {
      const secondary = surfaceTextureScaleVector(surface, "secondaryTextureScaleX", "secondaryTextureScaleY", "secondaryTextureScale");
      uniforms.secondaryScale.value.set(secondary.x, secondary.y);
    }
    if (surface.edgeFadeNoiseScaleX !== undefined || surface.edgeFadeNoiseScaleY !== undefined || surface.edgeFadeNoiseScale !== undefined) {
      const edge = surfaceTextureScaleVector(surface, "edgeFadeNoiseScaleX", "edgeFadeNoiseScaleY", "edgeFadeNoiseScale");
      uniforms.edgeNoiseScale.value.set(edge.x, edge.y);
    }
    if (surface.secondaryTextureStrength !== undefined) uniforms.secondaryStrength.value = clamp(num(surface.secondaryTextureStrength, uniforms.secondaryStrength.value), 0, 1);
    if (surface.edgeFadeWidth !== undefined) {
      const width = Math.max(0.1, num(surface.width !== undefined ? surface.width : material.userData.surfaceState?.width, 3));
      const edgeFade = num(surface.edgeFadeWidth, uniforms.edgeFadeWidth.value * width);
      uniforms.edgeFadeWidth.value = edgeFade > 0 ? clamp(edgeFade / width, 0, 0.45) : 0;
    }
    if (surface.edgeFadeNoiseStrength !== undefined) uniforms.edgeNoiseStrength.value = clamp(num(surface.edgeFadeNoiseStrength, uniforms.edgeNoiseStrength.value), 0, 1);
    if (surface.opacity !== undefined) uniforms.opacity.value = clamp(num(surface.opacity, uniforms.opacity.value), 0, 1);
    if (surface.flowSpeed !== undefined) uniforms.flowSpeed.value = num(surface.flowSpeed, uniforms.flowSpeed.value);
    if (surface.flowDirection !== undefined) {
      const flowRad = num(surface.flowDirection, 0) * Math.PI / 180;
      uniforms.flowDir.value.set(Math.sin(flowRad), Math.cos(flowRad));
    }
    if (surface.flowTextureLayer !== undefined) {
      const ftl = String(surface.flowTextureLayer || "main");
      uniforms.flowMain.value = (ftl === "main" || ftl === "both") ? 1.0 : 0.0;
      uniforms.flowSecondary.value = (ftl === "secondary" || ftl === "both") ? 1.0 : 0.0;
    }
    if (surface.fallbackColor !== undefined) {
      uniforms.fallbackColor.value.copy(colorFromHex(surface.fallbackColor, "#8a6f45"));
      if (!material.map) material.color.copy(colorFromHex(surface.fallbackColor, "#8a6f45"));
    }
    if (surface.textureAssetId !== undefined) {
      if (!surface.textureAssetId) {
        material.map = null;
        material.color.copy(uniforms.fallbackColor.value);
        material.needsUpdate = true;
      }
    }
    if (surface.secondaryTextureAssetId !== undefined) {
      uniforms.hasSecondaryTex.value = 0.0;
      uniforms.secondaryTex.value = getOrCreateSurfaceDefaultWhiteTex();
    }
    if (surface.edgeFadeNoiseAssetId !== undefined) {
      uniforms.hasEdgeNoiseTex.value = 0.0;
      uniforms.edgeNoiseTex.value = getOrCreateSurfaceDefaultWhiteTex();
    }
    if (surface.opacity !== undefined || surface.edgeFadeWidth !== undefined) {
      const transparent = uniforms.opacity.value < 0.999 || uniforms.edgeFadeWidth.value > 0.0;
      material.transparent = transparent;
      material.depthWrite = !transparent;
    }
    requestRender("surface-material-preview");
  }

  function setTerrainSurfacePreview(surfaceId, patch) {
    if (!surfaceId) return false;
    const record = surfaceMaterialRecords.get(surfaceId);
    if (!record?.material) return false;
    updateSurfaceMaterialUniforms(record.material, patch || {});
    return true;
  }

  function buildTerrainRuntimeVisuals(worldData) {
    const terrain = worldData?.terrain || {};
    const ground = worldData?.ground || null;
    const groundWidth = num(ground?.width, 0);
    const groundDepth = num(ground?.depth, 0);
    const groundY = num(ground?.y, 0);
    const hasGroundPlane = groundWidth > 0 && groundDepth > 0;
    const layers = Array.isArray(terrain.layers) ? terrain.layers.slice() : [];
    const paths = Array.isArray(terrain.paths) ? terrain.paths : [];
    const waters = Array.isArray(terrain.waters) ? terrain.waters : [];
    const surfaces = Array.isArray(terrain.surfaces) ? terrain.surfaces : [];
    let renderIndex = 0;

    function applyTextureToMaterial(material, textureAssetId) {
      const asset = assetById(worldData, textureAssetId);
      if (!asset) return;
      requestTerrainTexture(asset, function (texture) {
        material.map = texture;
        material.needsUpdate = true;
      }, groundWidth > 0 ? Math.max(1, groundWidth / 8) : 1, groundDepth > 0 ? Math.max(1, groundDepth / 8) : 1);
    }

    // For path/water surfaces, UV tiling is done by geometry uvScale — texture repeat stays (1,1).
    function applyPathSurfaceTexture(material, textureAssetId) {
      const asset = assetById(worldData, textureAssetId);
      if (!asset) return;
      requestTerrainTexture(asset, function (texture) {
        material.map = texture;
        material.needsUpdate = true;
      }, 1, 1);
    }

    function getOrCreateSurfaceDefaultWhiteTex() {
      if (surfaceDefaultWhiteTex && !surfaceDefaultWhiteTex.isDisposed) return surfaceDefaultWhiteTex;
      const data = new Uint8Array([255, 255, 255, 255]);
      surfaceDefaultWhiteTex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
      surfaceDefaultWhiteTex.needsUpdate = true;
      return surfaceDefaultWhiteTex;
    }

    function createSurfaceLayerMaterial(surface, options) {
      const opacity = clamp(num(surface?.opacity, 1), 0, 1);
      const width = Math.max(0.1, num(surface?.width, 3));
      const mainScale = surfaceScalePair(surface, "textureScaleX", "textureScaleY", "textureScale");
      const secondaryScale = surfaceScalePair(surface, "secondaryTextureScaleX", "secondaryTextureScaleY", "secondaryTextureScale");
      const edgeScale = surfaceScalePair(surface, "edgeFadeNoiseScaleX", "edgeFadeNoiseScaleY", "edgeFadeNoiseScale");
      const secondaryStrength = clamp(num(surface?.secondaryTextureStrength, 0.25), 0, 1);
      const edgeFadeW = num(surface?.edgeFadeWidth, 0.8);
      const edgeFadeWidthUV = edgeFadeW > 0 ? clamp(edgeFadeW / width, 0, 0.45) : 0;
      const edgeNoiseStrength = clamp(num(surface?.edgeFadeNoiseStrength, 0.35), 0, 1);

      const isAnimated = surface?.animated === true;
      const flowSpeed = isAnimated ? num(surface?.flowSpeed, 0) : 0;
      const flowDir = isAnimated ? num(surface?.flowDirection, 0) : 0;
      const flowRad = flowDir * Math.PI / 180;
      const flowDirX = Math.sin(flowRad);
      const flowDirY = Math.cos(flowRad);
      const ftl = String(surface?.flowTextureLayer || "main");
      const flowMain = (ftl === "main" || ftl === "both") ? 1.0 : 0.0;
      const flowSecondary = (ftl === "secondary" || ftl === "both") ? 1.0 : 0.0;
      const whiteTex = getOrCreateSurfaceDefaultWhiteTex();
      const fallbackHex = surface?.fallbackColor || "#8a6f45";
      const uniforms = {
        secondaryTex: { value: whiteTex },
        hasSecondaryTex: { value: 0.0 },
        secondaryStrength: { value: secondaryStrength },
        mainScale: { value: new THREE.Vector2(mainScale.x, mainScale.y) },
        secondaryScale: { value: new THREE.Vector2(secondaryScale.x, secondaryScale.y) },
        edgeNoiseTex: { value: whiteTex },
        hasEdgeNoiseTex: { value: 0.0 },
        edgeFadeWidth: { value: edgeFadeWidthUV },
        edgeNoiseStrength: { value: edgeNoiseStrength },
        edgeNoiseScale: { value: new THREE.Vector2(edgeScale.x, edgeScale.y) },
        opacity: { value: opacity },
        time: { value: 0.0 },
        flowSpeed: { value: flowSpeed },
        flowDir: { value: new THREE.Vector2(flowDirX, flowDirY) },
        flowMain: { value: flowMain },
        flowSecondary: { value: flowSecondary },
        fallbackColor: { value: colorFromHex(fallbackHex, "#8a6f45") }
      };
      const mat = new THREE.MeshStandardMaterial({
        color: colorFromHex(fallbackHex, "#8a6f45"),
        roughness: 1,
        metalness: 0,
        transparent: opacity < 0.999 || edgeFadeWidthUV > 0,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: opacity >= 0.999 && edgeFadeWidthUV <= 0
      });
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = num(options?.polygonOffsetFactor, -5);
      mat.polygonOffsetUnits = num(options?.polygonOffsetUnits, -5);
      mat.customProgramCacheKey = function () {
        return "surface-layer-lit-v4";
      };
      mat.onBeforeCompile = function (shader) {
        shader.uniforms.secondaryTex = uniforms.secondaryTex;
        shader.uniforms.hasSecondaryTex = uniforms.hasSecondaryTex;
        shader.uniforms.secondaryStrength = uniforms.secondaryStrength;
        shader.uniforms.mainScale = uniforms.mainScale;
        shader.uniforms.secondaryScale = uniforms.secondaryScale;
        shader.uniforms.edgeNoiseTex = uniforms.edgeNoiseTex;
        shader.uniforms.hasEdgeNoiseTex = uniforms.hasEdgeNoiseTex;
        shader.uniforms.edgeFadeWidth = uniforms.edgeFadeWidth;
        shader.uniforms.edgeNoiseStrength = uniforms.edgeNoiseStrength;
        shader.uniforms.edgeNoiseScale = uniforms.edgeNoiseScale;
        shader.uniforms.opacity = uniforms.opacity;
        shader.uniforms.time = uniforms.time;
        shader.uniforms.flowSpeed = uniforms.flowSpeed;
        shader.uniforms.flowDir = uniforms.flowDir;
        shader.uniforms.flowMain = uniforms.flowMain;
        shader.uniforms.flowSecondary = uniforms.flowSecondary;
        shader.uniforms.fallbackColor = uniforms.fallbackColor;
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vSurfaceUv;")
          .replace("#include <uv_vertex>", "#include <uv_vertex>\nvSurfaceUv = uv;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying vec2 vSurfaceUv;\nuniform sampler2D secondaryTex;\nuniform float hasSecondaryTex;\nuniform float secondaryStrength;\nuniform vec2 secondaryScale;\nuniform sampler2D edgeNoiseTex;\nuniform float hasEdgeNoiseTex;\nuniform float edgeFadeWidth;\nuniform float edgeNoiseStrength;\nuniform vec2 edgeNoiseScale;\nuniform float time;\nuniform float flowSpeed;\nuniform vec2 flowDir;\nuniform float flowMain;\nuniform float flowSecondary;\nuniform vec3 fallbackColor;")
          .replace("#include <color_fragment>", "#include <color_fragment>\nvec2 surfaceFlow = flowDir * time * flowSpeed;\nvec2 surfaceSecondaryUv = vSurfaceUv * secondaryScale + surfaceFlow * flowSecondary;\nvec2 surfaceEdgeNoiseUv = vSurfaceUv * edgeNoiseScale;\nvec3 surfaceBaseColor = diffuseColor.rgb;\nvec4 surfaceSecondarySample = hasSecondaryTex > 0.5 ? sRGBTransferEOTF(texture2D(secondaryTex, surfaceSecondaryUv)) : vec4(surfaceBaseColor, diffuseColor.a);\nvec3 surfaceFinalColor = mix(surfaceBaseColor, surfaceSecondarySample.rgb, secondaryStrength * hasSecondaryTex);\nfloat surfaceEdgeDistance = min(vSurfaceUv.x, 1.0 - vSurfaceUv.x);\nfloat surfaceEdgeNoise = 0.0;\nif (hasEdgeNoiseTex > 0.5 && edgeNoiseStrength > 0.0 && edgeFadeWidth > 0.0) {\n  surfaceEdgeNoise = (texture2D(edgeNoiseTex, surfaceEdgeNoiseUv).r * 2.0 - 1.0) * edgeNoiseStrength * max(edgeFadeWidth, 0.001);\n}\nfloat surfaceEdgeAlpha = edgeFadeWidth > 0.001 ? smoothstep(0.0, edgeFadeWidth, surfaceEdgeDistance + surfaceEdgeNoise) : 1.0;\ndiffuseColor.rgb = surfaceFinalColor;\ndiffuseColor.a *= surfaceEdgeAlpha;");
      };
      mat.userData.surfaceUniforms = uniforms;
      mat.userData.surfaceState = Object.assign({}, surface);
      return mat;
    }

    function applySurfaceLayerTexture(material, assetId, uniformName, hasUniformName) {
      const asset = assetById(worldData, assetId);
      if (!asset) return;
      requestTerrainTexture(asset, function (texture) {
        const uniforms = material?.userData?.surfaceUniforms || null;
        if (!uniforms) return;
        const textureClone = texture.clone();
        textureClone.colorSpace = THREE.SRGBColorSpace;
        textureClone.wrapS = THREE.RepeatWrapping;
        textureClone.wrapT = THREE.RepeatWrapping;
        textureClone.needsUpdate = true;
        const mainScale = uniforms.mainScale?.value || null;
        if (uniformName === "mainTex") {
          textureClone.repeat.set(mainScale?.x || 1, mainScale?.y || 1);
          material.map = textureClone;
          material.color.set(0xffffff);
          material.needsUpdate = true;
          requestRender("surface-main-texture-loaded");
          return;
        }
        if (!uniforms[uniformName] || !uniforms[hasUniformName]) return;
        uniforms[uniformName].value = texture;
        uniforms[hasUniformName].value = 1.0;
        requestRender("surface-texture-loaded");
      }, 1, 1);
    }

    for (const layer of layers.sort(function (left, right) {
      return num(left?.priority, 0) - num(right?.priority, 0);
    })) {
      const shapeType = String(layer?.shapeType || "full").trim().toLowerCase();
      const presetColor = terrainPresetColor(layer?.material);
      const userColor = colorFromHex(layer?.color, presetColor);
      const finalColor = mixColors(userColor, presetColor, 0.28);
      const opacity = clamp(num(layer?.opacity, 1), 0, 1);
      const priority = num(layer?.priority, 0);
      const yOffset = 0.05 + clamp(priority, -1000, 1000) * 0.001;
      let geometry = null;
      let positionY = groundY + yOffset;

      if (shapeType === "polygon") {
        geometry = createPolygonShapeGeometry(layer?.points);
      } else if (hasGroundPlane) {
        geometry = new THREE.PlaneGeometry(groundWidth, groundDepth, 1, 1);
        geometry.rotateX(-Math.PI / 2);
      }
      if (!geometry) continue;

      const material = createOverlayMaterial(finalColor, opacity, {
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2
      });
      if (layer?.textureAssetId) applyTextureToMaterial(material, layer.textureAssetId);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "GK terrain layer " + String(layer?.id || "terrain");
      mesh.position.y = positionY;
      mesh.renderOrder = 1000 + renderIndex;
      mesh.frustumCulled = false;
      mesh.userData.terrainRuntime = true;
      addTerrainRuntimeMesh(mesh);
      runtimeStats.terrainLayers += 1;
      renderIndex += 1;
    }

    const pathBaseY = groundY;
    for (const path of paths) {
      const width = Math.max(0, num(path?.width, 0));
      if (width <= 0) continue;
      const rawPoints = normalizeWorldPointList(path?.points);
      if (rawPoints.length < 2) continue;
      const centerline = rawPoints.length >= 3 ? smoothPolyline(rawPoints, 8) : rawPoints;
      const pathType = String(path?.pathType || "sand").trim().toLowerCase();
      const presetColor = pathPresetColor(pathType);
      const baseColor = colorFromHex(path?.color, presetColor);
      const finalColor = mixColors(baseColor, presetColor, 0.2);
      const slightlySunken = path?.slightlySunken === true || String(path?.slightlySunken || "").toLowerCase() === "true";
      if (slightlySunken) finalColor.offsetHSL(0, 0.03, -0.05);
      const yOffset = num(path?.yOffset, 0.01) + (slightlySunken ? -0.003 : 0);
      const surfaceY = pathBaseY + yOffset;
      const opacity = clamp(num(path?.opacity, 1), 0, 1);
      const geometry = buildSurfaceStripGeometry(centerline, {
        width: width,
        y: surfaceY,
        uvScale: Math.max(0.01, num(path?.textureScale, 1))
      });
      if (!geometry) continue;
      const material = createOverlayMaterial(finalColor, opacity, {
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3
      });
      if (path?.materialMode === "texture" && path?.textureAssetId) applyPathSurfaceTexture(material, path.textureAssetId);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "GK path layer " + String(path?.id || "path");
      mesh.renderOrder = 2000 + renderIndex;
      mesh.frustumCulled = false;
      mesh.userData.terrainRuntime = true;
      addTerrainRuntimeMesh(mesh);
      runtimeStats.terrainPaths += 1;
      renderIndex += 1;
    }

    for (const water of waters) {
      const width = Math.max(0, num(water?.width, 0));
      if (width <= 0) continue;
      const rawPoints = normalizeWorldPointList(water?.points);
      if (rawPoints.length < 2) continue;
      const centerline = rawPoints.length >= 3 ? smoothPolyline(rawPoints, 8) : rawPoints;
      const waterType = String(water?.waterType || "river").trim().toLowerCase();
      const presetColor = waterPresetColor(waterType);
      const baseColor = colorFromHex(water?.color, presetColor);
      const finalColor = mixColors(baseColor, presetColor, 0.22);
      if (waterType === "lake") finalColor.offsetHSL(-0.01, 0.04, -0.04);
      if (waterType === "pond") finalColor.offsetHSL(0.03, 0.08, 0.02);
      const requestedY = num(water?.y, groundY + 0.04);
      const visualY = requestedY < groundY + 0.04 ? groundY + 0.04 : requestedY;
      const opacity = clamp(num(water?.opacity, 1), 0, 1);
      const geometry = buildSurfaceStripGeometry(centerline, {
        width: width,
        y: visualY,
        uvScale: Math.max(0.01, num(water?.textureScale, 1))
      });
      if (!geometry) continue;
      const material = createOverlayMaterial(finalColor, opacity, {
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4
      });
      if (water?.materialMode === "texture" && water?.textureAssetId) applyPathSurfaceTexture(material, water.textureAssetId);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "GK water layer " + String(water?.id || "water");
      mesh.renderOrder = 3000 + renderIndex;
      mesh.frustumCulled = false;
      mesh.userData.terrainRuntime = true;
      addTerrainRuntimeMesh(mesh);
      runtimeStats.terrainWaters += 1;
      renderIndex += 1;
      // flowSpeed: UV scroll animation requires textureAssetId — not active in this phase
    }

    for (const surface of surfaces) {
      const width = Math.max(0, num(surface?.width, 0));
      if (width <= 0) continue;
      const rawPoints = normalizeWorldPointList(surface?.points);
      if (rawPoints.length < 2) continue;
      const centerline = rawPoints.length >= 3 ? smoothPolyline(rawPoints, 8) : rawPoints;
      const yOffset = num(surface?.yOffset, 0.02);
      const surfaceY = groundY + yOffset;
      const geometry = buildSurfaceStripGeometry(centerline, {
        width: width,
        y: surfaceY,
        uvScale: 1
      });
      if (!geometry) continue;
      const material = createSurfaceLayerMaterial(surface, {
        polygonOffsetFactor: -5,
        polygonOffsetUnits: -5
      });
      if (surface?.textureAssetId) {
        applySurfaceLayerTexture(material, surface.textureAssetId, "mainTex", "hasMainTex");
      }
      if (surface?.secondaryTextureAssetId && num(surface?.secondaryTextureStrength, 0) > 0) {
        applySurfaceLayerTexture(material, surface.secondaryTextureAssetId, "secondaryTex", "hasSecondaryTex");
      }
      if (surface?.edgeFadeNoiseAssetId && num(surface?.edgeFadeNoiseStrength, 0) > 0) {
        applySurfaceLayerTexture(material, surface.edgeFadeNoiseAssetId, "edgeNoiseTex", "hasEdgeNoiseTex");
      }
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "GK surface layer " + String(surface?.id || "surface");
      mesh.renderOrder = 3500 + renderIndex;
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.terrainRuntime = true;
      mesh.userData.surfaceLayerId = surface?.id || null;
      mesh.userData.entityId = surface?.id || null;
      addTerrainRuntimeMesh(mesh);
      surfaceMaterialRecords.set(surface?.id || mesh.uuid, {
        surfaceId: surface?.id || mesh.uuid,
        material: material,
        uniforms: material.userData.surfaceUniforms,
        mesh: mesh
      });
      if (surface?.animated && num(surface?.flowSpeed, 0) !== 0) {
        surfaceAnimMaterials.push({
          material: material,
          uniforms: material.userData.surfaceUniforms,
          mainMap: null,
          baseMainOffset: new THREE.Vector2()
        });
      }
      runtimeStats.terrainSurfaces += 1;
      renderIndex += 1;
    }
  }

  function pickTerrainEditorHandle(clientX, clientY) {
    if (mode !== "editor" || !terrainEditorOverlay || !terrainEditorOverlay.visible) return null;
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(terrainEditorOverlay.children, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      const object = hit.object;
      if (object?.userData?.terrainHandle) {
        return {
          nodeId: object.userData.nodeId || null,
          handleRole: object.userData.handleRole || null,
          pointIndex: Number.isInteger(object.userData.pointIndex) ? object.userData.pointIndex : null
        };
      }
    }
    return null;
  }

  function updateTransformGuide() {
    if (!transformGuide) return;
    const object = selectedRoot;
    transformGuide.visible = Boolean(object);
    if (!object) return;
    object.updateWorldMatrix(true, true);
    const position = new THREE.Vector3();
    object.getWorldPosition(position);
    transformGuide.position.copy(position);
    transformGuide.quaternion.identity();
    const box = new THREE.Box3().setFromObject(object);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z, 1);
    transformGuide.scale.setScalar(Math.min(6, Math.max(0.75, maxSize * 0.65)));
  }

  function getSelectedEntitySnapshot() {
    const root = refreshSelectedRootReference();
    if (!root) return null;
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(size);
    return {
      entityId: selectableIdForObject(root),
      type: root.userData?.playerId ? "player_character" : "model_entity",
      position: { x: round(root.position.x), y: round(root.position.y), z: round(root.position.z) },
      rotation: {
        x: round(root.rotation.x / DEG_TO_RAD),
        y: round(root.rotation.y / DEG_TO_RAD),
        z: round(root.rotation.z / DEG_TO_RAD)
      },
      scale: { x: round(root.scale.x), y: round(root.scale.y), z: round(root.scale.z) },
      dimensions: { x: round(size.x), y: round(size.y), z: round(size.z) },
      hasBounds: !box.isEmpty()
    };
  }

  function updateSelectionHelper() {
    if (!selectionHelper) return;
    const object = refreshSelectedRootReference();
    if (!object) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
      if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
      if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
      updateTransformGuide();
      return;
    }
    object.updateWorldMatrix(true, true);
    object.traverse(function (child) {
      child.updateWorldMatrix(true, false);
    });
    selectionHelper.object = object;
    selectionHelper.visible = true;
    if (typeof selectionHelper.setFromObject === "function") selectionHelper.setFromObject(object);
    else selectionHelper.update();
    if (selectionHelper.geometry?.computeBoundingBox) selectionHelper.geometry.computeBoundingBox();
    if (selectionHelper.geometry?.computeBoundingSphere) selectionHelper.geometry.computeBoundingSphere();
    updateTransformGuide();
  }

  function clearSelectedRuntimeEntity() {
    selectedEntityId = null;
    selectedRoot = null;
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = false;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    if (selectionHelper) {
      selectionHelper.object = null;
      selectionHelper.visible = false;
    }
    if (transformGuide) transformGuide.visible = false;
    transformAxisConstraint = null;
    if (orbitControls) orbitControls.enabled = true;
    applyLocalView();
  }

  function applyLocalView() {
    const activeRoot = localViewActive ? selectedRoot : null;
    for (const child of content.children) {
      child.visible = !activeRoot || child === activeRoot;
    }
  }

  function captureTransformStart(object) {
    return {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      values: objectToTransform(object)
    };
  }

  function restoreTransformStart(state) {
    if (!state || !transformSession?.object) return;
    transformSession.object.position.copy(state.position);
    transformSession.object.rotation.copy(state.rotation);
    transformSession.object.scale.copy(state.scale);
  }

  function constraintKeyToAxis(axisKey) {
    if (axisKey === "x") return "x";
    if (axisKey === "y") return "z";
    if (axisKey === "z") return "y";
    return null;
  }

  function currentTransformAxes() {
    if (!transformAxisConstraint) {
      return { x: true, y: true, z: true };
    }
    const axis = constraintKeyToAxis(transformAxisConstraint);
    return {
      x: axis === "x",
      y: axis === "y",
      z: axis === "z"
    };
  }

  function activeSnapMode() {
    if (snapState.mode === "off" && modifierState.ctrlKey) return "grid";
    return snapState.mode;
  }

  function pointerFromEvent(event, buttonOverride) {
    return {
      x: Number(event.clientX) || 0,
      y: Number(event.clientY) || 0,
      button: buttonOverride !== undefined ? buttonOverride : event.button
    };
  }

  function getObjectScreenCenter(object) {
    if (!object) return null;
    object.updateWorldMatrix(true, true);
    const worldPosition = new THREE.Vector3();
    object.getWorldPosition(worldPosition);
    const ndc = worldPosition.clone().project(camera);
    if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || !Number.isFinite(ndc.z) || ndc.z < -1 || ndc.z > 1) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (ndc.x + 1) * 0.5 * rect.width,
      y: rect.top + (-ndc.y + 1) * 0.5 * rect.height
    };
  }

  function radialAngleForPointer(center, pointer) {
    if (!center || !pointer) return null;
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 8) return null;
    return Math.atan2(dy, dx);
  }

  function normalizeAngleDelta(delta) {
    if (!Number.isFinite(delta)) return null;
    let next = delta;
    while (next > Math.PI) next -= Math.PI * 2;
    while (next < -Math.PI) next += Math.PI * 2;
    return next;
  }

  function radialRotationDelta(transform, pointer) {
    const center = transform?.radialCenter || getObjectScreenCenter(transform?.object);
    const startAngle = Number.isFinite(transform?.radialStartAngle)
      ? transform.radialStartAngle
      : radialAngleForPointer(center, transform?.startPointer);
    const currentAngle = radialAngleForPointer(center, pointer);
    if (!Number.isFinite(startAngle) || !Number.isFinite(currentAngle)) {
      const dx = pointer.x - transform.startPointer.x;
      const dy = pointer.y - transform.startPointer.y;
      return -(dx - dy) * 0.01;
    }
    const delta = normalizeAngleDelta(currentAngle - startAngle);
    return Number.isFinite(delta) ? -delta : 0;
  }

  function radialDistanceForPointer(center, pointer) {
    if (!center || !pointer) return null;
    const dx = pointer.x - center.x;
    const dy = pointer.y - center.y;
    const distance = Math.hypot(dx, dy);
    return Number.isFinite(distance) ? distance : null;
  }

  function radialScaleFactor(transform, pointer) {
    const center = transform?.radialCenter || getObjectScreenCenter(transform?.object);
    const startDistance = Number.isFinite(transform?.radialStartDistance)
      ? transform.radialStartDistance
      : radialDistanceForPointer(center, transform?.startPointer);
    const currentDistance = radialDistanceForPointer(center, pointer);
    if (!Number.isFinite(startDistance) || !Number.isFinite(currentDistance)) {
      const dx = pointer.x - transform.startPointer.x;
      const dy = pointer.y - transform.startPointer.y;
      return Math.max(0.001, 1 + (dx - dy) * 0.005);
    }
    return Math.max(0.001, 1 + (currentDistance - startDistance) * 0.005);
  }

  function projectedGroundVector(vector, fallbackX, fallbackZ) {
    const next = vector.clone();
    next.y = 0;
    if (next.lengthSq() < 0.000001) next.set(fallbackX, 0, fallbackZ);
    if (next.lengthSq() < 0.000001) next.set(1, 0, 0);
    return next.normalize();
  }

  function cameraGroundBasis() {
    camera.updateMatrixWorld(true);
    const screenRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const screenUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    return {
      right: projectedGroundVector(screenRight, 1, 0),
      forward: projectedGroundVector(screenUp, 0, -1)
    };
  }

  function worldUnitsPerPixel() {
    if (!orbitControls) return 0.01;
    const element = canvas;
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return 0.01;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      return 2 * targetDistance / Math.max(1, element.clientHeight || 1);
    }
    if (camera.isOrthographicCamera) {
      const height = Math.max(1, element.clientHeight || 1);
      return (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
    }
    return 0.01;
  }

  function transformLabelForMode(mode) {
    if (mode === "rotate") return "Rotate Z";
    if (mode === "scale") return "Scale";
    return "Move";
  }

  function rootForSelectedTransform() {
    return selectedRoot || rootForSelectableId(selectedEntityId);
  }

  function isPointerOverTransformControls() {
    return false;
  }

  function selectableRootForObject(object) {
    let current = object;
    while (current) {
      if (current.userData?.entityId || current.userData?.playerId) return current;
      current = current.parent || null;
    }
    return null;
  }

  function applyTransformToObject(object, transform, pointer) {
    if (!object || !transform) return false;
    const mode = transform.mode || "move";
    const axis = transform.axis || null;
    const scale = worldUnitsPerPixel();
    const basis = cameraGroundBasis();
    const dx = pointer.x - transform.startPointer.x;
    const dy = pointer.y - transform.startPointer.y;
    let changed = false;
    if (mode === "move") {
      const groundDelta = new THREE.Vector3();
      groundDelta.addScaledVector(basis.right, dx * scale);
      groundDelta.addScaledVector(basis.forward, -dy * scale);
      const next = transform.startPosition.clone();
      if (!axis) {
        next.x += groundDelta.x;
        next.z += groundDelta.z;
        next.y = transform.startPosition.y;
      } else if (axis === "x") {
        next.x += groundDelta.x;
      } else if (axis === "y") {
        next.z += groundDelta.z;
      } else if (axis === "z") {
        next.y += -dy * scale;
      }
      if (snapState.mode === "grid" || (snapState.mode === "off" && modifierState.ctrlKey)) {
        const gridSize = Math.max(0.0001, num(snapState.gridSize, 1));
        if (!axis || axis === "x") next.x = Math.round(next.x / gridSize) * gridSize;
        if (!axis || axis === "y") next.z = Math.round(next.z / gridSize) * gridSize;
        if (!axis || axis === "z") next.y = Math.round(next.y / gridSize) * gridSize;
      }
      if (snapState.mode === "ground" && object.userData.snapToGround !== false) {
        next.y = num(world?.ground?.y, 0);
      }
      if (!object.position.equals(next)) {
        object.position.copy(next);
        changed = true;
      }
    } else if (mode === "rotate") {
      const next = transform.startRotation.clone();
      const rotationAxis = constraintKeyToAxis(axis || "z") || "y";
      next[rotationAxis] = transform.startRotation[rotationAxis] + radialRotationDelta(transform, pointer);
      if (!object.rotation.equals(next)) {
        object.rotation.copy(next);
        changed = true;
      }
    } else if (mode === "scale") {
      const factor = radialScaleFactor(transform, pointer);
      const next = transform.startScale.clone();
      if (!axis) {
        const uniform = Math.max(0.001, transform.startScale.x * factor);
        next.set(uniform, uniform, uniform);
      } else if (axis === "x") {
        next.x = Math.max(0.001, transform.startScale.x * factor);
      } else if (axis === "y") {
        next.z = Math.max(0.001, transform.startScale.z * factor);
      } else if (axis === "z") {
        next.y = Math.max(0.001, transform.startScale.y * factor);
      }
      if (!object.scale.equals(next)) {
        object.scale.copy(next);
        changed = true;
      }
    }
    return changed;
  }

  function applyTransformPreview(pointer, triggerChange = true) {
    if (!transformSession?.object) return false;
    const object = transformSession.object;
    const session = transformSession;
    session.currentPointer = { x: pointer.x, y: pointer.y };
    const dx = pointer.x - session.startPointer.x;
    const dy = pointer.y - session.startPointer.y;
    const changed = applyTransformToObject(object, session, pointer);
    transformDebugState = {
      active: true,
      rootId: session.rootId,
      mode: session.mode,
      axis: session.axis,
      dx: round(dx),
      dy: round(dy),
      changed: changed,
      previews: (transformDebugState.previews || 0) + 1,
      lastInputAt: Date.now()
    };
    if (changed) {
      updateSelectionHelper();
      if (triggerChange) onTransformChange(session.rootId, objectToTransform(object));
      requestRender();
    }
    return changed;
  }

  function previewTransformAt(clientX, clientY, triggerChange = true) {
    if (!transformSession?.object) return false;
    const x = Number(clientX);
    const y = Number(clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    rememberEditorPointer({ clientX: x, clientY: y });
    return applyTransformPreview({ x: x, y: y }, triggerChange);
  }

  function beginTransform(modeName) {
    if (transformSession?.object) return false;
    const root = rootForSelectedTransform();
    if (!root || root.userData.transformable === false) return false;
    viewportPanSession = null;
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    const rect = canvas.getBoundingClientRect();
    const startPointer = lastEditorPointer
      ? { x: lastEditorPointer.clientX, y: lastEditorPointer.clientY }
      : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    const radialCenter = mode === "rotate" || mode === "scale" ? getObjectScreenCenter(root) : null;
    transformState = {
      active: true,
      cancelled: false,
      object: root,
      rootId: selectableIdForObject(root),
      start: captureTransformStart(root),
      mode: mode,
      axis: transformAxisConstraint,
      startPointer: startPointer,
      currentPointer: { x: startPointer.x, y: startPointer.y },
      startPosition: root.position.clone(),
      startRotation: root.rotation.clone(),
      startScale: root.scale.clone(),
      radialCenter: radialCenter,
      radialStartAngle: radialAngleForPointer(radialCenter, startPointer),
      radialStartDistance: radialDistanceForPointer(radialCenter, startPointer)
    };
    transformSession = transformState;
    transformDebugState = {
      active: true,
      rootId: transformState.rootId,
      mode: transformState.mode,
      axis: transformState.axis,
      dx: 0,
      dy: 0,
      changed: false,
      previews: 0,
      lastInputAt: Date.now()
    };
    if (orbitControls) orbitControls.enabled = false;
    canvas.style.cursor = mode === "rotate" ? "ew-resize" : mode === "scale" ? "nwse-resize" : "move";
    applyTransformPreview(startPointer, false);
    updateSelectionHelper();
    onTransformChange(transformState.rootId, objectToTransform(root));
    requestRender();
    return true;
  }

  function beginKeyboardTransform() {
    return beginTransform(transformState.mode || "move");
  }

  function setGizmoMode(modeName) {
    const mode = modeName === "translate" ? "move" : modeName === "rotate" || modeName === "scale" ? modeName : "move";
    transformState.mode = mode;
    if (transformSession) {
      transformSession.mode = mode;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    requestRender();
  }

  function setTransformAxis(axis) {
    transformAxisConstraint = axis === "x" || axis === "y" || axis === "z" ? axis : null;
    if (transformSession) {
      transformSession.axis = transformAxisConstraint;
      if (transformSession.currentPointer) applyTransformPreview(transformSession.currentPointer);
    }
    applyTransformSnapState();
    requestRender();
  }

  function finishTransform(commit) {
    if (!transformSession?.object) return false;
    const session = transformSession;
    const object = session.object;
    const start = session.start;
    const rootId = session.rootId;
    const current = objectToTransform(object);
    const changed = Boolean(start && JSON.stringify(current) !== JSON.stringify(start.values));
    const shouldCommit = Boolean(commit && changed && rootId);
    if (!commit && start) {
      restoreTransformStart(start);
    }
    transformSession = null;
    transformState.active = false;
    transformState.cancelled = !commit;
    transformState.object = null;
    transformState.rootId = null;
    transformState.start = null;
    transformState.axis = null;
    transformDebugState = Object.assign({}, transformDebugState, {
      active: false,
      rootId: rootId,
      mode: session.mode,
      axis: session.axis,
      changed: changed,
      lastInputAt: Date.now()
    });
    if (orbitControls) orbitControls.enabled = true;
    canvas.style.cursor = "";
    transformAxisConstraint = null;
    clearSelectedRuntimeEntity();
    if (shouldCommit) onTransformCommit(rootId, current);
    onTransformEnd({
      action: commit ? "confirm" : "cancel",
      entityId: rootId,
      mode: session.mode,
      axis: session.axis,
      transform: current,
      changed: changed
    });
    updateSelectionHelper();
    requestRender();
    return shouldCommit;
  }

  function confirmTransform() {
    if (transformSession?.object && lastEditorPointer) {
      previewTransformAt(lastEditorPointer.clientX, lastEditorPointer.clientY, true);
    }
    return finishTransform(true);
  }

  function cancelTransform() {
    return finishTransform(false);
  }

  function handleTransformPointerMove(event) {
    rememberEditorPointer(event);
    if (transformSession?.object) {
      event.preventDefault();
      event.stopImmediatePropagation();
      previewTransformAt(event.clientX, event.clientY, true);
      return;
    }
    if (viewportPanSession) handleViewportPanMove(event);
  }

  function handleTransformPointerUp(event) {
    rememberEditorPointer(event);
    if (transformSession?.object) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.button === 2 || event.button === 1) {
        cancelTransform();
        return;
      }
      if (event.button === 0 || event.button === undefined) {
        previewTransformAt(event.clientX, event.clientY, true);
        confirmTransform();
        return;
      }
      return;
    }
    if (viewportPanSession) handleViewportPanUp(event);
  }

  function applyTransformSnapState() {
    if (!transformSession?.object) return;
    if (transformSession.currentPointer) {
      applyTransformPreview(transformSession.currentPointer, false);
    }
  }

  function fitDistanceForBox(box, fovDegrees) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxSize = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxSize) || maxSize <= 0.0001) return 8;
    const fov = (fovDegrees || camera.fov || 60) * DEG_TO_RAD;
    return (maxSize * 1.25) / Math.tan(fov / 2);
  }

  function frameObject(object, preserveDirection) {
    if (!orbitControls || !object) return false;
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      const target = new THREE.Vector3();
      object.getWorldPosition(target);
      orbitControls.target.copy(target);
      orbitControls.update();
      requestRender();
      return true;
    }
    const center = new THREE.Vector3();
    box.getCenter(center);
    const currentOffset = camera.position.clone().sub(orbitControls.target);
    const direction = preserveDirection && currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();
    const distance = Math.max(1, fitDistanceForBox(box, camera.fov));
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function frameEntity(entityId) {
    const object = rootForSelectableId(entityId);
    if (!object) return false;
    return frameObject(object, true);
  }

  function frameAll() {
    if (localViewActive && selectedObjectRoot()) {
      return frameObject(selectedObjectRoot(), true);
    }
    return frameObject(content, true);
  }

  function frameWorldPoints(positions) {
    if (!orbitControls || !Array.isArray(positions) || positions.length === 0) return false;
    const box = new THREE.Box3();
    for (const pos of positions) {
      const x = Number(pos?.x);
      const y = Number(pos?.y);
      const z = Number(pos?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      const py = Number.isFinite(y) ? y : 0;
      box.expandByPoint(new THREE.Vector3(x, py, z));
    }
    if (box.isEmpty()) return false;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const currentOffset = camera.position.clone().sub(orbitControls.target);
    const direction = currentOffset.lengthSq() > 0.0001
      ? currentOffset.normalize()
      : new THREE.Vector3(1, 1, 1).normalize();
    const distance = Math.max(2, fitDistanceForBox(box, camera.fov));
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function setView(viewName) {
    if (!orbitControls) return false;
    const object = selectedObjectRoot() || content;
    const box = new THREE.Box3().setFromObject(object);
    const center = new THREE.Vector3();
    if (box.isEmpty()) {
      object.getWorldPosition(center);
    } else {
      box.getCenter(center);
    }
    const distance = Math.max(1, camera.position.distanceTo(orbitControls.target) || camDistance || 8);
    let direction = null;
    if (viewName === "front") direction = new THREE.Vector3(0, 0, 1);
    else if (viewName === "right") direction = new THREE.Vector3(1, 0, 0);
    else if (viewName === "top") direction = new THREE.Vector3(0, 1, 0);
    if (!direction) return false;
    orbitControls.target.copy(center);
    camera.position.copy(center).add(direction.multiplyScalar(distance));
    if (viewName === "top") camera.up.set(0, 0, -1); else camera.up.set(0, 1, 0);
    orbitControls.update();
    updateSelectionHelper();
    requestRender();
    return true;
  }

  function setTransformAxisConstraint(axis) {
    return setTransformAxis(axis);
  }

  function beginViewportPan(event) {
    if (!orbitControls || !event) return false;
    viewportPanSession = {
      pointerId: event.pointerId,
      lastClientX: event.clientX,
      lastClientY: event.clientY
    };
    if (typeof canvas.setPointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.setPointerCapture(event.pointerId); } catch {}
    }
    return true;
  }

  function panOrbitByPixels(deltaX, deltaY) {
    if (!orbitControls) return;
    const element = canvas;
    const pan = new THREE.Vector3();
    camera.updateMatrixWorld(true);
    if (camera.isPerspectiveCamera) {
      const distance = camera.position.distanceTo(orbitControls.target);
      if (!Number.isFinite(distance) || distance <= 0) return;
      const targetDistance = distance * Math.tan((camera.fov * DEG_TO_RAD) / 2);
      const scale = 2 * targetDistance / Math.max(1, element.clientHeight || 1);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scale);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scale);
    } else if (camera.isOrthographicCamera) {
      const width = Math.max(1, element.clientWidth || 1);
      const height = Math.max(1, element.clientHeight || 1);
      const scaleX = (camera.right - camera.left) / Math.max(1, camera.zoom * width);
      const scaleY = (camera.top - camera.bottom) / Math.max(1, camera.zoom * height);
      pan.setFromMatrixColumn(camera.matrix, 0).multiplyScalar(-deltaX * scaleX);
      pan.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1), deltaY * scaleY);
    } else {
      return;
    }
    camera.position.add(pan);
    orbitControls.target.add(pan);
    orbitControls.update();
    requestRender();
  }

  function handleViewportPanMove(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const deltaX = event.clientX - viewportPanSession.lastClientX;
    const deltaY = event.clientY - viewportPanSession.lastClientY;
    viewportPanSession.lastClientX = event.clientX;
    viewportPanSession.lastClientY = event.clientY;
    if (Math.abs(deltaX) > 0 || Math.abs(deltaY) > 0) panOrbitByPixels(deltaX, deltaY);
  }

  function handleViewportPanUp(event) {
    if (!viewportPanSession || event.pointerId !== viewportPanSession.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    viewportPanSession = null;
    if (typeof canvas.releasePointerCapture === "function" && event.pointerId !== undefined) {
      try { canvas.releasePointerCapture(event.pointerId); } catch {}
    }
    requestRender();
  }

  function setSnapState(modeName, gridSize) {
    snapState.mode = ["off", "grid", "ground"].includes(modeName) ? modeName : "off";
    snapState.gridSize = Math.max(0.001, num(gridSize, 1));
    applyTransformSnapState();
    requestRender();
  }

  function setAnimationPreviewEnabled(enabled) {
    previewAnimations = Boolean(enabled);
    requestRender("preview-toggle");
    return previewAnimations;
  }

  function isAnimationPreviewEnabled() {
    return previewAnimations;
  }

  function applyCameraConfig(worldData) {
    const cam = worldData?.camera;
    camPitch = num(cam?.pitch, 60);
    camYaw = num(cam?.yaw, 0);
    camDistance = num(cam?.distance, 20);
    camMinDistance = num(cam?.minDistance, 6);
    camMaxDistance = num(cam?.maxDistance, 500);
    camFollow = cam?.follow !== false;
    camRotateSpeed = num(cam?.rotateSpeed, 90);
    camera.fov = num(cam?.fov, 55);
    camera.updateProjectionMatrix();
    camTarget.set(player.pos.x, player.pos.y, player.pos.z);
    updateCameraPosition();
    if (orbitControls) {
      orbitControls.target.copy(camTarget);
      orbitControls.minDistance = camMinDistance;
      orbitControls.maxDistance = camMaxDistance;
      orbitControls.update();
    }
  }

  function updateCameraPosition() {
    const pitchRad = camPitch * DEG_TO_RAD;
    const yawRad = camYaw * DEG_TO_RAD;
    const horizontal = Math.cos(pitchRad) * camDistance;
    const offsetX = Math.sin(yawRad) * horizontal;
    const offsetZ = Math.cos(yawRad) * horizontal;
    const offsetY = Math.sin(pitchRad) * camDistance;
    camera.position.set(camTarget.x + offsetX, camTarget.y + offsetY, camTarget.z + offsetZ);
    camera.lookAt(camTarget);
  }

  function setZoom(value) {
    camDistance = Math.min(camMaxDistance, Math.max(camMinDistance, value));
  }

  function addGround(worldData) {
    const ground = worldData?.ground;
    if (!ground?.width || !ground?.depth) return;
    const geometry = new THREE.PlaneGeometry(num(ground.width, 1), num(ground.depth, 1), 1, 1);
    geometry.rotateX(-Math.PI / 2);
    const materialOptions = { color: new THREE.Color(colorOrDefault(ground.materialColor, "#ffffff")), roughness: 0.9, metalness: 0 };
    const textureAsset = assetById(worldData, ground.textureAssetId);
    if (textureAsset?.sourcePath) {
      let texture = textureCache.get(textureAsset.id);
      if (!texture) {
        texture = textureLoader.load(textureAsset.sourcePath, requestRender, undefined, function (error) {
          loadErrors.push("Ground texture: " + textureAsset.name);
          renderHud();
        });
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const repeat = num(ground.textureRepeat, 1);
        texture.repeat.set(repeat, repeat);
        textureCache.set(textureAsset.id, texture);
      }
      materialOptions.map = texture;
    }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial(materialOptions));
    mesh.name = "published-ground";
    mesh.receiveShadow = true;
    mesh.position.y = num(ground.y, 0);
    content.add(mesh);
    runtimeStats.sceneObjects += 1;
    runtimeStats.meshes += 1;
  }

  function addLights(worldData) {
    for (const light of worldData?.lights || []) {
      if (light.type === "ambient") {
        content.add(new THREE.AmbientLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0)));
        runtimeStats.sceneObjects += 1;
      } else if (light.type === "directional") {
        const directional = new THREE.DirectionalLight(colorOrDefault(light.color, "#ffffff"), num(light.intensity, 0));
        directional.position.set(num(light.position?.x, 0), num(light.position?.y, 0), num(light.position?.z, 0));
        directional.castShadow = true;
        directional.shadow.mapSize.set(2048, 2048);
        directional.shadow.camera.left = -60;
        directional.shadow.camera.right = 60;
        directional.shadow.camera.top = 60;
        directional.shadow.camera.bottom = -60;
        directional.shadow.camera.far = 400;
        content.add(directional);
        runtimeStats.sceneObjects += 1;
      }
    }
  }

  function loadModelInto(root, assetId, worldData, onReady) {
    const asset = assetById(worldData, assetId);
    if (!asset?.sourcePath) return;
    let record = modelCache.get(asset.id);
    if (!record) {
      record = { status: "loading", gltf: null, waiters: [] };
      modelCache.set(asset.id, record);
      const startedAt = performance.now();
      console.info("[timing] GLTFLoader load start asset=" + asset.id + " path=" + asset.sourcePath);
      try {
        loader.load(asset.sourcePath, function (gltf) {
          record.status = "ready";
          record.gltf = gltf;
          record.gltf.animations = normalizeAnimations(gltf.animations);
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms");
          if (typeof onModelLoadTiming === "function") {
            onModelLoadTiming({
              assetId: asset.id,
              assetName: asset.name,
              sourcePath: asset.sourcePath,
              durationMs: Number(timingMs(startedAt)),
              ok: true
            });
          }
          for (const waiter of record.waiters.splice(0)) waiter(gltf);
        }, undefined, function () {
          record.status = "error";
          loadErrors.push("Model: " + asset.name);
          renderHud();
          console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
          if (typeof onModelLoadTiming === "function") {
            onModelLoadTiming({
              assetId: asset.id,
              assetName: asset.name,
              sourcePath: asset.sourcePath,
              durationMs: Number(timingMs(startedAt)),
              ok: false
            });
          }
        });
      } catch (error) {
        record.status = "error";
        loadErrors.push("Model: " + asset.name);
        renderHud();
        console.info("[timing] GLTFLoader load end asset=" + asset.id + " " + timingMs(startedAt) + "ms error");
        if (typeof onModelLoadTiming === "function") {
          onModelLoadTiming({
            assetId: asset.id,
            assetName: asset.name,
            sourcePath: asset.sourcePath,
            durationMs: Number(timingMs(startedAt)),
            ok: false
          });
        }
        throw error;
      }
    }
    const attach = function (gltf) {
      const clone = SkeletonUtils.clone(gltf.scene);
      clone.traverse(function (child) {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      root.add(clone);
      const cloneCounts = countObjectTree(clone);
      runtimeStats.sceneObjects += cloneCounts.objects;
      runtimeStats.meshes += cloneCounts.meshes;
      const mixer = new THREE.AnimationMixer(clone);
      animationMixers.set(root, {
        mixer: mixer,
        root: clone,
        actions: new Map(),
        currentAction: null,
        currentClipName: null,
        clips: gltf.animations || [],
        assetMetadata: asset.metadata || {}
      });
      playAnimationState(root, "idle", 0);
      if (onReady) onReady(clone);
      if (selectedEntityId && selectableIdForObject(root) === selectedEntityId) selectEntity(selectedEntityId);
      requestRender();
    };
    if (record.status === "ready") attach(record.gltf);
    if (record.status === "loading") record.waiters.push(attach);
  }

  function transformObject(object, transform) {
    const position = transform?.position || {};
    const rotation = transform?.rotation || {};
    const scale = transform?.scale || {};
    object.position.set(num(position.x, 0), num(position.y, 0), num(position.z, 0));
    object.rotation.set(num(rotation.x, 0) * DEG_TO_RAD, num(rotation.y, 0) * DEG_TO_RAD, num(rotation.z, 0) * DEG_TO_RAD);
    object.scale.set(num(scale.x, 1), num(scale.y, 1), num(scale.z, 1));
  }

  function objectToTransform(object) {
    return {
      x: round(object.position.x),
      y: round(object.position.y),
      z: round(object.position.z),
      rotationX: round(object.rotation.x / DEG_TO_RAD),
      rotationY: round(object.rotation.y / DEG_TO_RAD),
      rotationZ: round(object.rotation.z / DEG_TO_RAD),
      scaleX: round(object.scale.x),
      scaleY: round(object.scale.y),
      scaleZ: round(object.scale.z)
    };
  }

  function round(value) {
    return Math.round(Number(value) * 1000) / 1000;
  }

  function normalizeAnimations(animations) {
    return (animations || []).map(function (clip, index) {
      const next = clip.clone();
      const name = String(next.name || "").trim();
      next.name = name || "Animation " + (index + 1);
      return next;
    });
  }

  function findClipName(clips, preferredName) {
    const names = (clips || []).map(function (clip) { return String(clip?.name || "").trim(); }).filter(Boolean);
    if (!names.length) return null;
    const preferred = String(preferredName || "").trim();
    if (!preferred) return null;
    const exact = names.find(function (name) { return name === preferred; });
    if (exact) return exact;
    const lower = preferred.toLowerCase();
    const caseMatch = names.find(function (name) { return name.toLowerCase() === lower; });
    if (caseMatch) return caseMatch;
    const contains = names.find(function (name) { return name.toLowerCase().includes(lower); });
    if (contains) return contains;
    return null;
  }

  function resolveClipNameForState(root, clips, stateName, assetMetadata) {
    const state = String(stateName || "").trim().toLowerCase();
    const data = root?.userData || {};
    if (!Array.isArray(clips) || !clips.length) return null;
    if (state === "walk") {
      return findClipName(clips, data.walkAnimation)
        || findClipName(clips, "Walk")
        || resolveClipNameForState(root, clips, "idle", assetMetadata);
    }
    if (state === "run") {
      return findClipName(clips, data.runAnimation)
        || findClipName(clips, "Run")
        || resolveClipNameForState(root, clips, "walk", assetMetadata)
        || resolveClipNameForState(root, clips, "idle", assetMetadata);
    }
    const defaultName = String(assetMetadata?.defaultAnimation || "").trim();
    return findClipName(clips, data.idleAnimation)
      || findClipName(clips, data.animationClip)
      || findClipName(clips, defaultName)
      || findClipName(clips, "Idle")
      || String(clips[0]?.name || "").trim()
      || null;
  }

  function getAnimationAction(record, clipName) {
    if (!record || !clipName) return null;
    const existing = record.actions.get(clipName);
    if (existing) return existing;
    const clip = (record.clips || []).find(function (candidate) {
      return String(candidate?.name || "").trim() === clipName;
    }) || null;
    if (!clip) return null;
    const action = record.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    record.actions.set(clipName, action);
    return action;
  }

  function playAnimationState(root, stateName, fadeSeconds = 0.15) {
    const record = animationMixers.get(root);
    if (!record || !Array.isArray(record.clips) || !record.clips.length) return null;
    const clipName = resolveClipNameForState(root, record.clips, stateName, record.assetMetadata || {});
    if (!clipName) return null;
    if (record.currentClipName === clipName) return clipName;
    const nextAction = getAnimationAction(record, clipName);
    if (!nextAction) return null;
    const previousAction = record.currentAction;
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    if (previousAction && previousAction !== nextAction) {
      if (fadeSeconds > 0) {
        previousAction.fadeOut(fadeSeconds);
        nextAction.fadeIn(fadeSeconds);
      } else {
        previousAction.stop();
      }
    } else {
      nextAction.setEffectiveWeight(1);
    }
    nextAction.play();
    record.currentAction = nextAction;
    record.currentClipName = clipName;
    return clipName;
  }

  function addEntity(worldData, entity) {
    const root = new THREE.Group();
    root.userData.entityId = entity.id;
    root.userData.transformable = true;
    root.userData.snapToGround = true;
    root.userData.animationClip = entity.animationClip || null;
    root.userData.idleAnimation = entity.idleAnimation || null;
    root.userData.walkAnimation = entity.walkAnimation || null;
    root.userData.runAnimation = entity.runAnimation || null;
    root.name = entity.id;
    transformObject(root, entity.transform);
    entityRoots.set(entity.id, root);
    content.add(root);
    runtimeStats.sceneObjects += 1;
    loadModelInto(root, entity.modelAssetId, worldData);
    if (entity.solid) {
      solids.push({ x: num(entity.transform?.position?.x, 0), z: num(entity.transform?.position?.z, 0), radius: num(entity.collisionRadius, 1) });
    }
  }

  function addInteractable(worldData, inter) {
    const x = num(inter.position?.x, 0);
    const z = num(inter.position?.z, 0);
    const groundY = num(worldData?.ground?.y, 0);
    if (inter.modelAssetId) {
      const root = new THREE.Group();
      root.userData.interactableId = inter.id;
      root.userData.transformable = false;
      root.userData.snapToGround = true;
      root.position.set(x, groundY, z);
      content.add(root);
      runtimeStats.sceneObjects += 1;
      loadModelInto(root, inter.modelAssetId, worldData);
    }
    interactables.push({ id: inter.id, x: x, z: z, radius: num(inter.radius, 2), prompt: inter.prompt, action: inter.action });
  }

  function spawnPlayer(worldData) {
    const def = worldData?.player;
    const spawn = worldData?.spawn;
    if (!def || !spawn) return;
    const groundY = num(worldData?.ground?.y, 0);
    player.speed = num(def.moveSpeed, 6);
    player.sprint = num(def.sprintMultiplier, 1.6);
    player.turnSpeed = num(def.turnSpeed, 600);
    player.radius = num(def.collisionRadius, 0.5);
    player.facing = num(spawn.facing, 0) * DEG_TO_RAD;
    player.pos.set(num(spawn.x, 0), groundY, num(spawn.z, 0));
    const root = new THREE.Group();
    root.name = "player";
    root.userData.playerId = def.id;
    root.userData.transformable = false;
    root.userData.snapToGround = false;
    root.userData.animationClip = def.animationClip || null;
    root.userData.idleAnimation = def.idleAnimation || null;
    root.userData.walkAnimation = def.walkAnimation || null;
    root.userData.runAnimation = def.runAnimation || null;
    root.position.copy(player.pos);
    root.rotation.y = player.facing;
    const scale = num(def.scale, 1);
    root.scale.set(scale, scale, scale);
    player.root = root;
    content.add(root);
    runtimeStats.sceneObjects += 1;
    loadModelInto(root, def.modelAssetId, worldData);
  }

  function selectEntity(entityId) {
    selectedEntityId = entityId || null;
    refreshSelectedRootReference();
    applyLocalView();
    if (selectionHelper) updateSelectionHelper();
    requestRender();
  }

  function pickEntity(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const pickRoots = terrainRuntimeGroup
      ? content.children.concat([terrainRuntimeGroup])
      : content.children;
    const hits = raycaster.intersectObjects(pickRoots, true);
    if (!hits.length) return null;
    for (const hit of hits) {
      let object = hit.object;
      while (object && object !== content) {
        if (object.visible === false) break;
        if (object === selectionHelper || object === transformGuide) break;
        if (object.name === "GK editor transform guide" || String(object.name || "").startsWith("GK editor transform guide")) break;
        if (object.userData?.entityId || object.userData?.playerId || object.userData?.surfaceLayerId) {
          return object.userData.entityId || object.userData.playerId || object.userData.surfaceLayerId || null;
        }
        object = object.parent || null;
      }
    }
    return null;
  }

  function pickEntityAt(clientX, clientY) {
    return pickEntity({ clientX: clientX, clientY: clientY });
  }

  function pickInteractable(event) {
    const ground = screenToGround(event.clientX, event.clientY);
    if (!ground) return null;
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      const dist = Math.hypot(ground.x - inter.x, ground.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    // Only trigger via click if player is also within range, so clicks far away walk instead.
    if (best && Math.hypot(player.pos.x - best.x, player.pos.z - best.z) <= best.radius) return best;
    return null;
  }

  function triggerInteractable(inter) {
    const action = inter.action || {};
    if (action.type === "teleport" && Number.isFinite(action.teleport?.x) && Number.isFinite(action.teleport?.z)) {
      player.pos.x = action.teleport.x;
      player.pos.z = action.teleport.z;
      clickTarget = null;
      showPrompt("Geteleporteerd.");
      return;
    }
    if (action.type === "message") {
      showPrompt(action.message || inter.prompt || "");
    }
  }

  function screenToGround(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    pointer.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const groundY = num(world?.ground?.y, 0);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(plane, hit)) return null;
    return { x: round(hit.x), y: groundY, z: round(hit.z) };
  }

  function resolveCollision(target) {
    resolveMovementInto(target, player.pos, target, {
      radius: player.radius,
      ground: world?.ground,
      solids: solids
    });
    return target;
  }

  function buildKeyMap(worldData) {
    keyToAction.clear();
    for (const bind of worldData?.keybinds || []) {
      if (bind.keyCode && bind.action) keyToAction.set(bind.keyCode, bind.action);
    }
  }

  function updateCameraGroundBasis() {
    const target = orbitControls ? orbitControls.target : camTarget;
    cameraForward.set(target.x - camera.position.x, 0, target.z - camera.position.z);
    if (cameraForward.lengthSq() < 0.0001) cameraForward.set(0, 0, -1);
    cameraForward.normalize();
    cameraRight.set(cameraForward.z, 0, -cameraForward.x);
  }

  function updatePlayer(delta) {
    if (mode !== "game" || !player.root) return;
    moveVector.set(0, 0, 0);
    updateCameraGroundBasis();
    let usingKeys = false;
    let isMoving = false;
    let isSprinting = false;
    if (isActionPressed("move_forward")) { moveVector.add(cameraForward); usingKeys = true; }
    if (isActionPressed("move_back")) { moveVector.sub(cameraForward); usingKeys = true; }
    if (isActionPressed("move_left")) { moveVector.sub(cameraRight); usingKeys = true; }
    if (isActionPressed("move_right")) { moveVector.add(cameraRight); usingKeys = true; }
    if (isActionPressed("rotate_cam_left")) camYaw -= camRotateSpeed * delta;
    if (isActionPressed("rotate_cam_right")) camYaw += camRotateSpeed * delta;

    if (!usingKeys && clickTarget) {
      const toTargetX = clickTarget.x - player.pos.x;
      const toTargetZ = clickTarget.z - player.pos.z;
      const dist = Math.hypot(toTargetX, toTargetZ);
      if (dist < 0.05) {
        clickTarget = null;
      } else {
        moveVector.set(toTargetX / dist, 0, toTargetZ / dist);
      }
    }

    if (moveVector.lengthSq() > 0.0001) {
      moveVector.normalize();
      const wantsSprint = usingKeys && isActionPressed("sprint");
      const speed = player.speed * (wantsSprint ? player.sprint : 1);
      movementTarget.set(player.pos.x + moveVector.x * speed * delta, player.pos.y, player.pos.z + moveVector.z * speed * delta);
      resolveCollision(movementTarget);
      if (movementTarget.distanceToSquared(player.pos) > 0.000001) {
        player.pos.copy(movementTarget);
        isMoving = true;
        isSprinting = wantsSprint;
      }
      const desiredFacing = Math.atan2(moveVector.x, moveVector.z);
      player.facing = stepAngle(player.facing, desiredFacing, player.turnSpeed * DEG_TO_RAD * delta);
    }

    player.root.position.copy(player.pos);
    player.root.rotation.y = player.facing;
    playAnimationState(player.root, isMoving ? (isSprinting ? "run" : "walk") : "idle");

    if (camFollow) camTarget.lerp(player.pos, Math.min(1, delta * 8));
    updateCameraPosition();
    updateInteractionFocus();
  }

  function isActionPressed(action) {
    for (const [code, boundAction] of keyToAction) {
      if (boundAction === action && pressedKeys.has(code)) return true;
    }
    return false;
  }

  function stepAngle(current, target, maxStep) {
    let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= maxStep) return target;
    return current + Math.sign(diff) * maxStep;
  }

  function updateInteractionFocus() {
    let best = null;
    let bestDist = Infinity;
    for (const inter of interactables) {
      const dist = Math.hypot(player.pos.x - inter.x, player.pos.z - inter.z);
      if (dist <= inter.radius && dist < bestDist) { best = inter; bestDist = dist; }
    }
    if (best !== activeInteractable) {
      activeInteractable = best;
      renderHud();
    }
  }

  // ---- HUD ----
  function resetRuntimeStats() {
    runtimeStats.sceneObjects = 0;
    runtimeStats.meshes = 0;
    runtimeStats.terrainVisuals = 0;
    runtimeStats.terrainLayers = 0;
    runtimeStats.terrainPaths = 0;
    runtimeStats.terrainWaters = 0;
    runtimeStats.terrainSurfaces = 0;
    runtimeStats.collisionShapes = 0;
    runtimeStats.entities = 0;
    runtimeStats.interactables = 0;
  }

  function countPublishedWorldItems(worldData) {
    let total = 0;
    if (worldData?.world) total += 1;
    if (worldData?.ground) total += 1;
    if (worldData?.camera) total += 1;
    if (worldData?.player) total += 1;
    if (worldData?.spawn) total += 1;
    total += Array.isArray(worldData?.lights) ? worldData.lights.length : 0;
    total += Array.isArray(worldData?.entities) ? worldData.entities.length : 0;
    total += Array.isArray(worldData?.interactables) ? worldData.interactables.length : 0;
    total += Array.isArray(worldData?.keybinds) ? worldData.keybinds.length : 0;
    total += Array.isArray(worldData?.ui) ? worldData.ui.length : 0;
    total += Array.isArray(worldData?.terrain?.layers) ? worldData.terrain.layers.length : 0;
    total += Array.isArray(worldData?.terrain?.paths) ? worldData.terrain.paths.length : 0;
    total += Array.isArray(worldData?.terrain?.waters) ? worldData.terrain.waters.length : 0;
    total += Array.isArray(worldData?.terrain?.surfaces) ? worldData.terrain.surfaces.length : 0;
    total += Array.isArray(worldData?.collision?.blockers) ? worldData.collision.blockers.length : 0;
    total += Array.isArray(worldData?.collision?.walkableSurfaces) ? worldData.collision.walkableSurfaces.length : 0;
    return total;
  }

  function formatCompactCount(value) {
    if (!Number.isFinite(value)) return "--";
    const abs = Math.abs(value);
    if (abs >= 1000000) return (value / 1000000).toFixed(abs >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (abs >= 1000) return (value / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, "") + "k";
    return String(Math.round(value));
  }

  function formatFrameMs(value) {
    if (!Number.isFinite(value)) return "--";
    return (value >= 10 ? value.toFixed(1) : value.toFixed(2)).replace(/\.0+$/, "") + "ms";
  }

  function formatBudgetedCount(value, budget) {
    const current = formatCompactCount(value);
    const target = formatCompactCount(budget);
    if (current === "--" || target === "--") return current;
    return current + " / " + target;
  }

  function formatBudgetedFrameMs(value, target) {
    const current = formatFrameMs(value);
    const limit = formatFrameMs(target);
    if (current === "--" || limit === "--") return current;
    return current + " / " + limit;
  }

  function toneHigherIsBetter(value, warn, danger) {
    if (!Number.isFinite(value)) return "neutral";
    if (Number.isFinite(danger) && value < danger) return "danger";
    if (Number.isFinite(warn) && value < warn) return "warn";
    return "ok";
  }

  function toneLowerIsBetter(value, warn, danger) {
    if (!Number.isFinite(value)) return "neutral";
    if (Number.isFinite(danger) && value > danger) return "danger";
    if (Number.isFinite(warn) && value > warn) return "warn";
    return "ok";
  }

  function setPerformanceRowValue(rowState, text, tone) {
    if (!rowState) return;
    rowState.value.textContent = text;
    rowState.value.className = "perf-hud-value perf-hud-value--" + (tone || "neutral");
  }

  function createPerformanceRow(labelText) {
    const row = document.createElement("div");
    row.className = "perf-hud-row";
    const label = document.createElement("span");
    label.className = "perf-hud-label";
    label.textContent = labelText;
    const value = document.createElement("span");
    value.className = "perf-hud-value perf-hud-value--neutral";
    value.textContent = "--";
    row.append(label, value);
    return { row: row, label: label, value: value };
  }

  function buildHud() {
    if (!hudElement) return;
    hudElement.innerHTML = "";
    const prompt = document.createElement("div");
    prompt.className = "hud-prompt";
    prompt.style.display = "none";
    hudElement.appendChild(prompt);
    hudNodes.prompt = prompt;
  }

  function clearHudModules() {
    for (const node of hudNodes.anchored.values()) node.remove();
    hudNodes.anchored.clear();
    for (const entry of hudNodes.performance.values()) entry.root.remove();
    hudNodes.performance.clear();
    perfHudNextUpdateAt = 0;
  }

  function buildHudTextModule(mod) {
    const el = document.createElement("div");
    el.className = "hud-text anchor-" + (mod.anchor || "top-left");
    el.textContent = mod.text || "";
    el.style.fontSize = num(mod.fontSize, 16) + "px";
    el.style.color = colorOrDefault(mod.color, "#ffffff");
    hudElement.appendChild(el);
    hudNodes.anchored.set(mod.id, el);
  }

  function buildPerformanceHudModule(mod) {
    const metrics = mod.metrics || {};
    const thresholds = mod.thresholds || {};
    const updateIntervalMs = Math.max(250, num(mod.updateIntervalMs, 500));
    const root = document.createElement("div");
    root.className = "perf-hud anchor-" + (mod.anchor || "top-right") + (mod.compact === false ? "" : " perf-hud--compact");
    root.dataset.hudId = mod.id || "perf_hud";
    const title = document.createElement("div");
    title.className = "perf-hud-title";
    title.textContent = mod.label || "Performance HUD";
    root.appendChild(title);
    const rows = document.createElement("div");
    rows.className = "perf-hud-rows";
    root.appendChild(rows);
    const rowStates = {};
    function addRow(key, labelText) {
      const rowState = createPerformanceRow(labelText);
      rows.appendChild(rowState.row);
      rowStates[key] = rowState;
    }
    if (metrics.showFps !== false) addRow("fps", "FPS");
    if (metrics.showFrameMs !== false) addRow("frameMs", "Frame");
    if (metrics.showRenderer !== false) addRow("renderer", "Renderer");
    if (metrics.showDrawCalls !== false) addRow("drawCalls", "Draw");
    if (metrics.showTriangles !== false) addRow("triangles", "Tris");
    if (metrics.showGeometries !== false) addRow("geometries", "Geo");
    if (metrics.showTextures !== false) addRow("textures", "Tex");
    if (metrics.showSceneObjects !== false) addRow("sceneObjects", "Objects");
    if (metrics.showEntities !== false) addRow("entities", "Entities");
    if (metrics.showEntities !== false) addRow("interactables", "Interact");
    if (metrics.showTerrainVisuals !== false) addRow("terrainVisuals", "Terrain");
    if (metrics.showCollisionShapes !== false) addRow("collisionShapes", "Coll");
    if (metrics.showWorldSize === true) addRow("worldSize", "World");
    hudElement.appendChild(root);
    hudNodes.performance.set(mod.id || "perf_hud", {
      root: root,
      rows: rowStates,
      metrics: metrics,
      thresholds: thresholds,
      updateIntervalMs: updateIntervalMs,
      nextUpdateAt: 0
    });
  }

  function setHudModules(modules) {
    hudModules = Array.isArray(modules) ? modules : [];
    if (!hudElement) return;
    clearHudModules();
    for (const mod of hudModules) {
      if (mod.type === "hud_text") {
        buildHudTextModule(mod);
      } else if (mod.type === "debug_performance_hud" && mod.enabled !== false) {
        buildPerformanceHudModule(mod);
      }
    }
  }

  function renderHud() {
    if (!hudElement || !hudNodes.prompt) return;
    if (activeInteractable) {
      hudNodes.prompt.textContent = activeInteractable.prompt || "Interact";
      hudNodes.prompt.style.display = "block";
    } else {
      hudNodes.prompt.style.display = "none";
    }
    if (loadErrors.length && options.onLoadErrors) options.onLoadErrors(loadErrors.slice());
  }

  function buildPerformanceSnapshot() {
    const info = renderer.info || {};
    const renderInfo = info.render || {};
    const memoryInfo = info.memory || {};
    return {
      fps: perfHudFrameMs > 0 ? 1000 / perfHudFrameMs : 0,
      frameMs: perfHudFrameMs,
      renderer: rendererLabel,
      drawCalls: Number(renderInfo.calls) || 0,
      triangles: Number(renderInfo.triangles) || 0,
      geometries: Number(memoryInfo.geometries) || 0,
      textures: Number(memoryInfo.textures) || 0,
      sceneObjects: runtimeStats.sceneObjects,
      meshes: runtimeStats.meshes,
      entities: runtimeStats.entities,
      interactables: runtimeStats.interactables,
      terrainVisuals: runtimeStats.terrainVisuals,
      collisionShapes: runtimeStats.collisionShapes,
      worldSize: countPublishedWorldItems(world)
    };
  }

  function debugCollisionAt(x, z, radius = 0) {
    return {
      blockedByWater: isPointBlockedByWater(undefined, x, z, radius),
      blockedByBlocker: isPointBlockedByBlocker(undefined, x, z, radius),
      blockedByTerrain: isPointBlockedByTerrain(undefined, x, z, radius),
      onWalkableSurface: isPointOnWalkableSurface(undefined, x, z)
    };
  }

  function debugState() {
    return {
      mode: mode,
      world: {
        terrain: {
          layers: Array.isArray(world?.terrain?.layers) ? world.terrain.layers.length : 0,
          paths: Array.isArray(world?.terrain?.paths) ? world.terrain.paths.length : 0,
          waters: Array.isArray(world?.terrain?.waters) ? world.terrain.waters.length : 0,
          surfaces: Array.isArray(world?.terrain?.surfaces) ? world.terrain.surfaces.length : 0
        },
        collision: {
          blockers: Array.isArray(world?.collision?.blockers) ? world.collision.blockers.length : 0,
          walkableSurfaces: Array.isArray(world?.collision?.walkableSurfaces) ? world.collision.walkableSurfaces.length : 0
        },
        ui: Array.isArray(world?.ui) ? world.ui.length : 0
      },
      player: {
        x: round(player.pos.x),
        y: round(player.pos.y),
        z: round(player.pos.z),
        radius: round(player.radius)
      },
      stats: {
        sceneObjects: runtimeStats.sceneObjects,
        meshes: runtimeStats.meshes,
        terrainVisuals: runtimeStats.terrainVisuals,
        terrainLayers: runtimeStats.terrainLayers,
        terrainPaths: runtimeStats.terrainPaths,
        terrainWaters: runtimeStats.terrainWaters,
        terrainSurfaces: runtimeStats.terrainSurfaces,
        collisionShapes: runtimeStats.collisionShapes,
        entities: runtimeStats.entities,
        interactables: runtimeStats.interactables
      }
    };
  }

  function debugTeleportPlayer(x, z) {
    if (!player.root) return debugState();
    player.pos.set(num(x, player.pos.x), player.pos.y, num(z, player.pos.z));
    player.root.position.copy(player.pos);
    if (camFollow) camTarget.lerp(player.pos, 1);
    updateCameraPosition();
    requestRender("debug-teleport");
    return debugState();
  }

  function debugStepPlayerTo(x, z) {
    if (!player.root) return debugState();
    movementTarget.set(num(x, player.pos.x), player.pos.y, num(z, player.pos.z));
    resolveCollision(movementTarget);
    player.pos.copy(movementTarget);
    player.root.position.copy(player.pos);
    if (camFollow) camTarget.lerp(player.pos, 1);
    updateCameraPosition();
    requestRender("debug-step");
    return debugState();
  }

  function updatePerformanceHud(now) {
    if (!hudNodes.performance.size) return;
    if (perfHudNextUpdateAt && now < perfHudNextUpdateAt) return;
    const snapshot = buildPerformanceSnapshot();
    let nextUpdateAt = Infinity;
    for (const entry of hudNodes.performance.values()) {
      if (now < entry.nextUpdateAt) {
        nextUpdateAt = Math.min(nextUpdateAt, entry.nextUpdateAt);
        continue;
      }
      const thresholds = entry.thresholds || {};
      const metrics = entry.metrics || {};
      if (metrics.showFps !== false && entry.rows.fps) {
        setPerformanceRowValue(entry.rows.fps, formatBudgetedCount(snapshot.fps, thresholds.fpsTarget), toneHigherIsBetter(snapshot.fps, thresholds.fpsWarn, thresholds.fpsDanger));
      }
      if (metrics.showFrameMs !== false && entry.rows.frameMs) {
        setPerformanceRowValue(entry.rows.frameMs, formatBudgetedFrameMs(snapshot.frameMs, thresholds.frameMsTarget), toneLowerIsBetter(snapshot.frameMs, thresholds.frameMsWarn, thresholds.frameMsDanger));
      }
      if (metrics.showRenderer !== false && entry.rows.renderer) {
        setPerformanceRowValue(entry.rows.renderer, snapshot.renderer, "neutral");
      }
      if (metrics.showDrawCalls !== false && entry.rows.drawCalls) {
        setPerformanceRowValue(entry.rows.drawCalls, formatBudgetedCount(snapshot.drawCalls, thresholds.drawCallsWarn), toneLowerIsBetter(snapshot.drawCalls, thresholds.drawCallsWarn, thresholds.drawCallsDanger));
      }
      if (metrics.showTriangles !== false && entry.rows.triangles) {
        setPerformanceRowValue(entry.rows.triangles, formatBudgetedCount(snapshot.triangles, thresholds.trianglesWarn), toneLowerIsBetter(snapshot.triangles, thresholds.trianglesWarn, thresholds.trianglesDanger));
      }
      if (metrics.showGeometries !== false && entry.rows.geometries) {
        setPerformanceRowValue(entry.rows.geometries, formatBudgetedCount(snapshot.geometries, thresholds.meshesWarn), toneLowerIsBetter(snapshot.geometries, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showTextures !== false && entry.rows.textures) {
        setPerformanceRowValue(entry.rows.textures, formatBudgetedCount(snapshot.textures, thresholds.texturesWarn), toneLowerIsBetter(snapshot.textures, thresholds.texturesWarn, thresholds.texturesDanger));
      }
      if (metrics.showSceneObjects !== false && entry.rows.sceneObjects) {
        setPerformanceRowValue(entry.rows.sceneObjects, formatBudgetedCount(snapshot.sceneObjects, thresholds.meshesWarn), toneLowerIsBetter(snapshot.sceneObjects, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showEntities !== false && entry.rows.entities) {
        setPerformanceRowValue(entry.rows.entities, formatBudgetedCount(snapshot.entities, thresholds.meshesWarn), toneLowerIsBetter(snapshot.entities, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showEntities !== false && entry.rows.interactables) {
        setPerformanceRowValue(entry.rows.interactables, formatBudgetedCount(snapshot.interactables, thresholds.meshesWarn), toneLowerIsBetter(snapshot.interactables, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      if (metrics.showTerrainVisuals !== false && entry.rows.terrainVisuals) {
        setPerformanceRowValue(entry.rows.terrainVisuals, formatBudgetedCount(snapshot.terrainVisuals, thresholds.terrainVisualsWarn), toneLowerIsBetter(snapshot.terrainVisuals, thresholds.terrainVisualsWarn, thresholds.terrainVisualsDanger));
      }
      if (metrics.showCollisionShapes !== false && entry.rows.collisionShapes) {
        setPerformanceRowValue(entry.rows.collisionShapes, formatBudgetedCount(snapshot.collisionShapes, thresholds.collisionShapesWarn), toneLowerIsBetter(snapshot.collisionShapes, thresholds.collisionShapesWarn, thresholds.collisionShapesDanger));
      }
      if (metrics.showWorldSize === true && entry.rows.worldSize) {
        setPerformanceRowValue(entry.rows.worldSize, formatBudgetedCount(snapshot.worldSize, thresholds.meshesWarn), toneLowerIsBetter(snapshot.worldSize, thresholds.meshesWarn, thresholds.meshesDanger));
      }
      entry.nextUpdateAt = now + entry.updateIntervalMs;
      nextUpdateAt = Math.min(nextUpdateAt, entry.nextUpdateAt);
    }
    perfHudNextUpdateAt = Number.isFinite(nextUpdateAt) ? nextUpdateAt : 0;
  }

  let promptTimer = null;
  function showPrompt(text) {
    if (!hudNodes.prompt) return;
    hudNodes.prompt.textContent = text;
    hudNodes.prompt.style.display = "block";
    if (promptTimer) clearTimeout(promptTimer);
    promptTimer = setTimeout(function () { renderHud(); }, 1800);
  }

  function setWorld(nextWorld) {
    world = nextWorld || null;
    const editorViewState = mode === "editor" && editorViewInitialized ? captureViewState() : null;
    clearContent();
    scene.background = new THREE.Color(colorOrDefault(world?.world?.backgroundColor, "#0b1622"));
    if (world?.world?.fogColor && num(world.world.fogDensity, 0) > 0) {
      scene.fog = new THREE.FogExp2(colorOrDefault(world.world.fogColor, "#0b1622"), num(world.world.fogDensity, 0));
    } else {
      scene.fog = null;
    }
    addGround(world);
    const nextWalkabilityIndex = buildWalkabilityIndex(world);
    runtimeStats.collisionShapes = (nextWalkabilityIndex.waters?.length || 0) + (nextWalkabilityIndex.blockers?.length || 0) + (nextWalkabilityIndex.walkables?.length || 0);
    runtimeStats.entities = Array.isArray(world?.entities) ? world.entities.length : 0;
    runtimeStats.interactables = Array.isArray(world?.interactables) ? world.interactables.length : 0;
    buildTerrainRuntimeVisuals(world);
    addLights(world);
    spawnPlayer(world);
    for (const entity of world?.entities || []) addEntity(world, entity);
    for (const inter of world?.interactables || []) addInteractable(world, inter);
    buildKeyMap(world);
    if (mode === "game") {
      setHudModules(world?.ui || []);
      camTarget.copy(player.pos);
    }
    applyCameraConfig(world);
    const restoredEditorView = editorViewState ? restoreViewState(editorViewState) : false;
    renderHud();
    if (!restoredEditorView) requestRender();
    if (mode === "editor") editorViewInitialized = true;
  }

  function destroy() {
    disposed = true;
    stopRenderLoop("destroy");
    viewportPanSession = null;
    if (resizeRafId !== null) cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
    windowResizeHandler = null;
    if (orbitControls) {
      orbitControls.removeEventListener("change", requestRender);
      if (typeof orbitControls.dispose === "function") orbitControls.dispose();
    }
    if (selectionHelper) {
      scene.remove(selectionHelper);
      if (selectionHelper.geometry) selectionHelper.geometry.dispose();
      if (selectionHelper.material) selectionHelper.material.dispose();
      selectionHelper = null;
    }
    clearTerrainRuntimeVisuals();
    clearWalkabilityIndex();
    if (transformGuide) {
      scene.remove(transformGuide);
      disposeObject(transformGuide);
      transformGuide = null;
    }
    if (terrainEditorOverlay) {
      scene.remove(terrainEditorOverlay);
      clearTerrainEditorOverlay();
      terrainEditorOverlay = null;
    }
    if (editorPointerDownCaptureHandler) canvas.removeEventListener("pointerdown", editorPointerDownCaptureHandler, true);
    if (editorPointerUpCaptureHandler) {
      canvas.removeEventListener("pointerup", editorPointerUpCaptureHandler, true);
      canvas.removeEventListener("pointercancel", editorPointerUpCaptureHandler, true);
    }
    if (editorDirectPointerMoveHandler) {
      canvas.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
      window.removeEventListener("pointermove", editorDirectPointerMoveHandler, true);
    }
    if (editorDirectPointerUpHandler) {
      canvas.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      canvas.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointerup", editorDirectPointerUpHandler, true);
      window.removeEventListener("pointercancel", editorDirectPointerUpHandler, true);
    }
    if (editorDirectMouseMoveHandler) {
      canvas.removeEventListener("mousemove", editorDirectMouseMoveHandler, true);
      window.removeEventListener("mousemove", editorDirectMouseMoveHandler, true);
    }
    if (editorDirectMouseUpHandler) {
      canvas.removeEventListener("mouseup", editorDirectMouseUpHandler, true);
      window.removeEventListener("mouseup", editorDirectMouseUpHandler, true);
    }
    if (editorContextMenuHandler) canvas.removeEventListener("contextmenu", editorContextMenuHandler);
    if (editorKeyDownHandler) window.removeEventListener("keydown", editorKeyDownHandler);
    if (editorKeyUpHandler) window.removeEventListener("keyup", editorKeyUpHandler);
    if (editorPointerDownHandler) canvas.removeEventListener("pointerdown", editorPointerDownHandler);
    if (gamePointerDownHandler) canvas.removeEventListener("pointerdown", gamePointerDownHandler);
    if (gameKeyDownHandler) window.removeEventListener("keydown", gameKeyDownHandler);
    if (gameKeyUpHandler) window.removeEventListener("keyup", gameKeyUpHandler);
    if (gameWheelHandler) canvas.removeEventListener("wheel", gameWheelHandler);
    clearHudModules();
    DEBUG_RUNTIME.activeResizeHandlers = 0;
  }

  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(function () {
      scheduleResize("observer");
    });
    resizeObserver.observe(resizeTarget);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  } else {
    windowResizeHandler = function () {
      scheduleResize("window");
    };
    window.addEventListener("resize", windowResizeHandler);
    DEBUG_RUNTIME.activeResizeHandlers = 1;
  }
  scheduleResize("init");
  requestRender("init");

  function focusSelected() {
    return frameEntity(selectedEntityId);
  }

  function deselect() {
    clearSelectedRuntimeEntity();
    requestRender();
  }

  function setLocalView(enabled) {
    localViewActive = Boolean(enabled);
    applyLocalView();
    updateSelectionHelper();
    requestRender();
    return localViewActive;
  }

  function toggleLocalView() {
    return setLocalView(!localViewActive);
  }

  function isLocalViewActive() {
    return localViewActive;
  }

  function isTransformActive() {
    return Boolean(transformSession?.object);
  }

  function isTransformControlsAttached() {
    return Boolean(selectedRoot);
  }

  function getTransformDebugState() {
    return Object.assign({}, transformDebugState);
  }

  return {
    setWorld: setWorld,
    render: requestRender,
    destroy: destroy,
    dispose: destroy,
    screenToGround: screenToGround,
    debugState: debugState,
    debugCollisionAt: debugCollisionAt,
    debugTeleportPlayer: debugTeleportPlayer,
    debugStepPlayerTo: debugStepPlayerTo,
    setTerrainEditorOverlay: setTerrainEditorOverlay,
    clearTerrainEditorOverlay: clearTerrainEditorOverlay,
    setTerrainSurfacePreview: setTerrainSurfacePreview,
    pickTerrainEditorHandle: pickTerrainEditorHandle,
    pickEntityAt: pickEntityAt,
    selectEntity: selectEntity,
    frameEntity: frameEntity,
    frameAll: frameAll,
    captureViewState: captureViewState,
    restoreViewState: restoreViewState,
    configureCallbacks: configureCallbacks,
    beginTransform: beginTransform,
    previewTransformAt: previewTransformAt,
    setGizmoMode: setGizmoMode,
    setTransformAxis: setTransformAxis,
    setTransformAxisConstraint: setTransformAxisConstraint,
    setSnapState: setSnapState,
    setAnimationPreviewEnabled: setAnimationPreviewEnabled,
    isAnimationPreviewEnabled: isAnimationPreviewEnabled,
    isPointerOverTransformControls: isPointerOverTransformControls,
    beginKeyboardTransform: beginKeyboardTransform,
    setView: setView,
    setLocalView: setLocalView,
    toggleLocalView: toggleLocalView,
    isLocalViewActive: isLocalViewActive,
    focusSelected: focusSelected,
    frameWorldPoints: frameWorldPoints,
    cancelTransform: cancelTransform,
    confirmTransform: confirmTransform,
    cancelTransformSession: cancelTransform,
    confirmTransformSession: confirmTransform,
    isTransformActive: isTransformActive,
    isTransformControlsAttached: isTransformControlsAttached,
    getTransformDebugState: getTransformDebugState,
    getSelectedEntitySnapshot: getSelectedEntitySnapshot,
    getSelectedEntityId: function () { return selectedEntityId; },
    deselect: deselect,
    getLoadErrors: function () { return loadErrors.slice(); }
  };
}
