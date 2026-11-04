import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { AssetService } from "../src/server/asset-service.js";
import { BuildService } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { loadEnvFile } from "../src/server/env.js";
import { resolveDatabasePath } from "../src/server/db.js";
import { resolveAssetsPath } from "../src/server/storage-policy.js";
import { MmoService } from "../src/server/mmo-service.js";
import {
  buildWalkabilityIndex,
  heightfieldForWorld,
  resolveMovement,
  resolveMovementStepInto,
  solidCollisionEntriesForWorld
} from "../apps/web/public/shared/movement-kernel.js";
import { terrainHeightAt } from "../apps/web/public/shared/terrain.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(rootDir);

const db = new DatabaseSync(resolveDatabasePath(rootDir), { readOnly: true });
const assetService = new AssetService(db, rootDir, { assetsDir: resolveAssetsPath(rootDir) });
const builds = new BuildService(db, { buildsRoot: path.join(path.dirname(resolveDatabasePath(rootDir)), "builds") });
const active = builds.activeServerBuild();
if (!active) throw new Error("Er is geen actieve gepubliceerde build.");

const world = buildRuntimeWorld(active.data, { assetService, buildId: active.buildId, publishedAt: "diagnose" });
const readTerrainChunk = (sha1) => assetService.readTerrainChunk(sha1);
const serverIndex = buildWalkabilityIndex(world, { readTerrainChunk });
const solids = solidCollisionEntriesForWorld(world);
const playerPosition = db.prepare(`
  SELECT pp.*, p.display_name
  FROM player_positions pp
  JOIN player_profiles p ON p.id = pp.player_id
  ORDER BY CASE WHEN lower(p.display_name) = 'kevin' THEN 0 ELSE 1 END, pp.updated_at DESC
  LIMIT 1
`).get();
if (!playerPosition) throw new Error("Geen laatste spelerspositie gevonden.");

const liveResponse = await fetch("http://127.0.0.1:3001/api/game/world");
if (!liveResponse.ok) throw new Error("Live clientwereld niet leesbaar: HTTP " + liveResponse.status);
const clientWorld = await liveResponse.json();
const clientHeightfield = heightfieldForWorld(clientWorld, { readTerrainChunk });
const clientIndex = buildWalkabilityIndex(clientWorld, { heightfield: clientHeightfield });

const refs = (value) => Object.entries(value?.terrain?.heightfield?.chunks || {}).sort(([a], [b]) => a.localeCompare(b));
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sampleOffsets = [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]];
const heightDifferences = sampleOffsets.map(([dx, dz]) => {
  const x = Number(playerPosition.x) + dx;
  const z = Number(playerPosition.z) + dz;
  return Math.abs(terrainHeightAt(serverIndex.heightfield, x, z) - terrainHeightAt(clientIndex.heightfield, x, z));
});

console.log("Build:", active.buildId);
console.log("Speler:", playerPosition.display_name, {
  x: playerPosition.x, y: playerPosition.y, z: playerPosition.z, updatedAt: playerPosition.updated_at
});
console.log("Index-pariteit:", {
  serverChunks: serverIndex.heightfield?.chunks?.size || 0,
  clientChunks: clientIndex.heightfield?.chunks?.size || 0,
  sameChunkRefs: sameJson(refs(world), refs(clientWorld)),
  maxSlopeDegServer: world?.terrain?.heightfield?.maxSlopeDeg,
  maxSlopeDegClient: clientWorld?.terrain?.heightfield?.maxSlopeDeg,
  sameWater: sameJson(serverIndex.waters, clientIndex.waters),
  waterCount: serverIndex.waters.length,
  maxHeightDifferenceNearPlayer: Math.max(...heightDifferences)
});

function fakeTickService() {
  return {
    pathQueueByPlayerId: new Map(),
    pointerStallTicksByPlayerId: new Map(),
    writeStoppedLatestInput() {},
    updatePlayerStateFromTick(_previous, next) { return next; },
    assignSpatialMembership() {}
  };
}

function clientRun(start, heading, sprint, durationMs) {
  const speed = Number(world.player.moveSpeed) * (sprint ? Number(world.player.sprintMultiplier) : 1);
  const dx = Math.cos(heading);
  const dz = Math.sin(heading);
  let position = { x: start.x, y: start.y, z: start.z };
  let stoppedSteps = 0;
  const timeline = new Map([[0, { ...position }]]);
  const stoppedAt = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += 16) {
    const next = resolveMovement(position, {
      x: position.x + dx * speed * 0.016,
      y: position.y,
      z: position.z + dz * speed * 0.016
    }, { index: clientIndex, solids, radius: world.player.collisionRadius });
    if (Math.hypot(next.x - position.x, next.z - position.z) < 0.000001) {
      stoppedSteps += 1;
      if (stoppedAt.length < 3) stoppedAt.push({ elapsedMs: elapsed + 16, x: position.x, z: position.z });
    }
    position = next;
    timeline.set(elapsed + 16, { ...position });
  }
  return { position, stoppedSteps, stoppedAt, timeline };
}

function serverRun(start, heading, sprint, durationMs) {
  const service = fakeTickService();
  const input = { moveX: Math.cos(heading), moveZ: Math.sin(heading), sprint };
  const context = { world, walkabilityIndex: serverIndex, solidColliders: solids };
  let state = {
    player_id: playerPosition.player_id,
    world_id: playerPosition.world_id,
    current_zone_id: playerPosition.current_zone_id,
    x: start.x, y: start.y, z: start.z, rotation_y: 0, revision: 1,
    moving: false, animation_state: "idle"
  };
  let stoppedSteps = 0;
  const timeline = new Map([[0, { x: state.x, y: state.y, z: state.z }]]);
  const stoppedAt = [];
  for (let elapsed = 0; elapsed < durationMs; elapsed += 20) {
    const next = MmoService.prototype.simulatePlayerTick.call(service, state, { input }, context, 20, {});
    if (Math.hypot(next.x - state.x, next.z - state.z) < 0.000001) {
      stoppedSteps += 1;
      if (stoppedAt.length < 3) stoppedAt.push({ elapsedMs: elapsed + 20, x: state.x, z: state.z });
    }
    state = next;
    timeline.set(elapsed + 20, { x: state.x, y: state.y, z: state.z });
  }
  return { position: state, stoppedSteps, stoppedAt, timeline };
}

const start = {
  x: Number(process.env.GK_DIAG_X ?? playerPosition.x),
  y: Number(process.env.GK_DIAG_Y ?? playerPosition.y),
  z: Number(process.env.GK_DIAG_Z ?? playerPosition.z)
};
const gradientAt = (heightfield, x, z) => {
  let strongest = { x: 0, z: 0, tan: 0 };
  for (const reach of [0.5, 1, 2]) {
    const dx = (terrainHeightAt(heightfield, x + reach, z) - terrainHeightAt(heightfield, x - reach, z)) / (2 * reach);
    const dz = (terrainHeightAt(heightfield, x, z + reach) - terrainHeightAt(heightfield, x, z - reach)) / (2 * reach);
    const tan = Math.hypot(dx, dz);
    if (tan > strongest.tan) strongest = { x: dx, z: dz, tan };
  }
  return strongest;
};
const shoreGradient = gradientAt(serverIndex.heightfield, start.x, start.z);
const tangentHeading = (Math.atan2(shoreGradient.x, -shoreGradient.z) * 180 / Math.PI + 360) % 360;
const headingOverride = Number(process.env.GK_DIAG_HEADING);
const headings = Number.isFinite(headingOverride)
  ? [headingOverride]
  : process.env.GK_DIAG_SHORE === "1"
    ? [tangentHeading, (tangentHeading + 180) % 360].flatMap((heading) => [-12, -8, -4, 0, 4, 8, 12]
      .map((offset) => (heading + offset + 360) % 360))
    : Array.from({ length: 90 }, (_, index) => index * 4);
console.log("Oeverrichtingen:", { tangentHeading: Number(tangentHeading.toFixed(1)), testedHeadings: headings.length });
if (process.env.GK_DIAG_PROBE === "1") {
  const speed = Number(world.player.moveSpeed);
  const probe = [];
  for (let degrees = 0; degrees < 360; degrees += 5) {
    const heading = degrees * Math.PI / 180;
    const next = resolveMovement(start, {
      x: start.x + Math.cos(heading) * speed * 0.016,
      y: start.y,
      z: start.z + Math.sin(heading) * speed * 0.016
    }, { index: clientIndex, solids, radius: world.player.collisionRadius });
    const distance = Math.hypot(next.x - start.x, next.z - start.z);
    if (distance > 0.000001) probe.push({ degrees, distance: Number(distance.toFixed(3)), x: next.x, z: next.z });
  }
  console.log("Geldige richtingen:", probe);
  if (Number.isFinite(headingOverride)) {
    const heading = headingOverride * Math.PI / 180;
    const internalSteps = [];
    for (const distance of [0.018, 0.0192, 0.021943, 0.024]) {
      const output = {};
      resolveMovementStepInto(output, start.x, start.y, start.z,
        start.x + Math.cos(heading) * distance, start.y, start.z + Math.sin(heading) * distance,
        clientIndex, clientWorld.ground, solids, world.player.collisionRadius);
      internalSteps.push({ distance, output, moved: Math.hypot(output.x - start.x, output.z - start.z) });
    }
    console.log("Interne substappen:", internalSteps);
  }
}
for (const sprint of [false, true]) {
  const results = [];
  for (const degrees of headings) {
    const heading = degrees * Math.PI / 180;
    const client = clientRun(start, heading, sprint, 1200);
    const server = serverRun(start, heading, sprint, 1200);
    results.push({
      degrees,
      difference: Math.hypot(client.position.x - server.position.x, client.position.z - server.position.z),
      client,
      server
    });
  }
  results.sort((a, b) => b.difference - a.difference);
  const worst = results[0];
  const commonTimeline = [];
  for (let elapsedMs = 80; elapsedMs <= 1200; elapsedMs += 80) {
    const clientPoint = worst.client.timeline.get(elapsedMs);
    const serverPoint = worst.server.timeline.get(elapsedMs);
    const difference = Math.hypot(clientPoint.x - serverPoint.x, clientPoint.z - serverPoint.z);
    if (difference > 0.1 || elapsedMs === 1200) {
      commonTimeline.push({ elapsedMs, difference: Number(difference.toFixed(3)), client: clientPoint, server: serverPoint });
      if (commonTimeline.length >= 3) break;
    }
  }
  console.log(sprint ? "Rennen:" : "Lopen:", {
    headingDeg: worst.degrees,
    endpointDifference: Number(worst.difference.toFixed(3)),
    clientStoppedSteps: worst.client.stoppedSteps,
    serverStoppedSteps: worst.server.stoppedSteps,
    clientStoppedAt: worst.client.stoppedAt,
    serverStoppedAt: worst.server.stoppedAt,
    firstDivergence: commonTimeline[0] || null,
    client: { x: worst.client.position.x, y: worst.client.position.y, z: worst.client.position.z },
    server: { x: worst.server.position.x, y: worst.server.position.y, z: worst.server.position.z }
  });
}

db.close();
