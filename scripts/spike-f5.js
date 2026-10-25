// Fase 05 (F5-E1-T01): twee kleine spikes, alleen lezen.
// 1) GLB: welke modellen hebben botten (skins) en welke animaties, zodat vijanden echte clipnamen krijgen.
// 2) Navtiles: dezelfde Cell twee keer bakken uit de gepubliceerde wereld -> zelfde hash en de tijd per Cell.
// Gebruik: node scripts/spike-f5.js [--cells=4]   (schrijft niets; opent de database read-only)
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createWalkabilityIndex, solidCollisionEntriesForWorld } from "../apps/web/public/shared/movement-kernel.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { createNavigator, NAV_CELL_M } from "../src/server/runtime/navigation.js";
import { resolveDatabasePath } from "../src/server/db.js";

const rootDir = process.cwd();
const cellArg = process.argv.find((arg) => arg.startsWith("--cells="));
const cellCount = Math.max(1, Math.min(16, Number(cellArg ? cellArg.split("=")[1] : 4) || 4));

function glbJson(file) {
  const data = fs.readFileSync(file);
  if (data.length < 20 || data.readUInt32LE(0) !== 0x46546c67) return null;
  const length = data.readUInt32LE(12);
  if (data.readUInt32LE(16) !== 0x4e4f534a) return null;
  return JSON.parse(data.subarray(20, 20 + length).toString("utf8"));
}

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.toLowerCase().endsWith(".glb")) out.push(full);
  }
  return out;
}

const assetsRoot = path.resolve(rootDir, process.env.ASSETS_PATH || "./assets");
const glbs = walk(assetsRoot);
console.log("== GLB-spike: " + glbs.length + " modellen onder " + assetsRoot);
for (const file of glbs.slice(0, 200)) {
  try {
    const json = glbJson(file);
    if (!json) { console.log("  ? " + path.relative(rootDir, file) + " (geen geldige GLB)"); continue; }
    const clips = (json.animations || []).map((clip, index) => clip.name || "clip_" + index);
    const bones = (json.skins || []).reduce((total, skin) => total + (skin.joints || []).length, 0);
    console.log("  " + path.relative(rootDir, file) + ": skins=" + (json.skins || []).length + " botten=" + bones + " animaties=[" + clips.join(", ") + "]");
  } catch (error) {
    console.log("  ! " + path.relative(rootDir, file) + ": " + error.message);
  }
}

const databasePath = resolveDatabasePath(rootDir);
if (!fs.existsSync(databasePath)) {
  console.log("== Navtile-spike overgeslagen: geen database op " + databasePath);
  process.exit(0);
}
const db = new DatabaseSync(databasePath, { readOnly: true });
const row = db.prepare("SELECT world_json FROM published_world_state WHERE id = 1").get();
if (!row) { console.log("== Navtile-spike overgeslagen: nog geen gepubliceerde wereld"); process.exit(0); }
let world = JSON.parse(row.world_json);
// Zelfde laag als de server: actieve canonieke build (obstakels uit Fase 04) over de legacy-wereld.
try {
  const release = db.prepare("SELECT active_build_id FROM authoring_release WHERE id = 1").get();
  const buildsRoot = process.env.AUTHORING_BUILDS_PATH || path.join(path.dirname(databasePath), "builds");
  const buildDir = path.resolve(rootDir, buildsRoot, release?.active_build_id || "-");
  const serverJson = path.join(buildDir, "server.json");
  if (release?.active_build_id && fs.existsSync(serverJson)) world = applyCanonicalBuild(world, { buildId: release.active_build_id, data: JSON.parse(fs.readFileSync(serverJson, "utf8")) });
} catch (error) {
  console.log("  (canonieke laag niet geladen: " + error.message + ")");
}
const index = createWalkabilityIndex(world);
const solids = solidCollisionEntriesForWorld(world);
const spawn = world?.spawn || world?.zonePackage?.spawns?.[0] || { x: 0, z: 0 };
const startCx = Math.floor(Number(spawn.x || 0) / NAV_CELL_M);
const startCz = Math.floor(Number(spawn.z || 0) / NAV_CELL_M);
console.log("== Navtile-spike: blockers=" + index.blockers.length + " oppervlakken=" + index.surfaceBlockers.length + " walkables=" + index.walkables.length + " solids=" + solids.length);
for (let i = 0; i < cellCount; i += 1) {
  const cx = startCx + (i % 2);
  const cz = startCz + Math.floor(i / 2);
  const first = createNavigator({ index, solids, radius: 0.5 }).bakeCell(cx, cz);
  const second = createNavigator({ index, solids, radius: 0.5 }).bakeCell(cx, cz);
  console.log("  Cell " + first.cellKey + ": " + first.ms.toFixed(1) + " ms / " + second.ms.toFixed(1) + " ms, geblokkeerd " + first.blockedTiles + "/" + first.tiles
    + ", hash " + first.hash.slice(0, 16) + (first.hash === second.hash ? " (gelijk)" : " (VERSCHILLEND!)"));
}
db.close();
