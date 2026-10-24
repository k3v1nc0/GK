// Prestatieprofiel op een KOPIE van een echte wereld, in een afgeschermde testserver.
//
//   GK_TEST_ISOLATED=1 GK_WORLD_SOURCE_DB=storage/gk-real-node-editor.sqlite node scripts/profile-world-copy.js
//
// Kopieert alleen wereldtabellen (graph, assets-lijst, gepubliceerde wereld, HUD-indeling) en de
// assetbestanden naar een tijdelijke map. Accounts, sessies en spelergegevens gaan nooit mee; de testserver krijgt
// eigen nep-accounts. De bron-database wordt alleen-lezen geopend. Alles wordt na afloop opgeruimd.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createIsolatedRuntime, requireIsolatedMode } from "./lib/test-isolation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORLD_TABLES = ["editor_nodes", "editor_node_edges", "asset_library", "published_world_state", "editor_graph_meta", "content_id_aliases", "game_hud_layout_defaults"];
// Kolommen die naar accounts verwijzen worden leeggemaakt: er gaan geen gebruikersgegevens mee.
const USER_REFERENCE_COLUMNS = new Set(["updated_by_user_id", "created_by_user_id", "user_id", "owner_user_id"]);
const WALK_PLAN = [["KeyW", 2500], ["KeyD", 2500], ["KeyS", 2500], ["KeyA", 2500], ["KeyW", 2500]];

let BASE = "";
let cookie = "";
let csrfToken = "";

function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function call(method, pathname, body) {
  const headers = { Origin: BASE, Accept: "application/json" };
  if (cookie) headers.Cookie = cookie;
  if (csrfToken && method !== "GET") headers["X-GK-CSRF"] = csrfToken;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(BASE + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const raw = response.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (json && json.csrfToken) csrfToken = json.csrfToken;
  return { status: response.status, json, text };
}

async function copyWorldIntoTempDatabase(sourcePath, runtime) {
  process.env.DATABASE_PATH = runtime.databasePath;
  process.env.ASSETS_PATH = runtime.assetsPath;
  const { openDatabase } = await import("../src/server/db.js");
  const target = await openDatabase(rootDir);
  const source = new DatabaseSync(path.resolve(rootDir, sourcePath), { readOnly: true });
  const counts = {};
  try {
    target.exec("PRAGMA foreign_keys = OFF");
    target.exec("BEGIN");
    for (const table of WORLD_TABLES.slice().reverse()) target.prepare("DELETE FROM " + table).run();
    for (const table of WORLD_TABLES) {
      const sourceColumns = source.prepare("PRAGMA table_info(" + table + ")").all().map(function (column) { return column.name; });
      const targetColumns = new Set(target.prepare("PRAGMA table_info(" + table + ")").all().map(function (column) { return column.name; }));
      const columns = sourceColumns.filter(function (column) { return targetColumns.has(column); });
      if (!columns.length) { counts[table] = "ontbreekt"; continue; }
      const insert = target.prepare("INSERT INTO " + table + " (" + columns.join(", ") + ") VALUES (" + columns.map(function () { return "?"; }).join(", ") + ")");
      const rows = source.prepare("SELECT " + columns.join(", ") + " FROM " + table).all();
      for (const row of rows) insert.run.apply(insert, columns.map(function (column) { return USER_REFERENCE_COLUMNS.has(column) ? null : row[column]; }));
      counts[table] = rows.length;
    }
    target.exec("COMMIT");
    target.exec("PRAGMA foreign_keys = ON");
  } catch (error) {
    target.exec("ROLLBACK");
    throw error;
  } finally {
    source.close();
    target.close();
  }
  return counts;
}

function summarizeProfile(profile, top = 25) {
  const nodesById = new Map(profile.nodes.map(function (node) { return [node.id, node]; }));
  const selfTime = new Map();
  const intervals = profile.timeDeltas || [];
  (profile.samples || []).forEach(function (nodeId, index) {
    const node = nodesById.get(nodeId);
    if (!node) return;
    const frame = node.callFrame || {};
    const url = String(frame.url || "").replace(/^.*\/(public|node_modules)\//, "");
    const key = (frame.functionName || "(anoniem)") + " @ " + (url || "(native)") + ":" + (Number(frame.lineNumber) + 1);
    selfTime.set(key, (selfTime.get(key) || 0) + (Number(intervals[index]) || 0) / 1000);
  });
  const total = Array.from(selfTime.values()).reduce(function (sum, value) { return sum + value; }, 0);
  return {
    totalMs: Math.round(total),
    top: Array.from(selfTime.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, top).map(function ([key, ms]) {
      return (ms).toFixed(0).padStart(7) + " ms  " + ((ms / Math.max(1, total)) * 100).toFixed(1).padStart(5) + "%  " + key;
    })
  };
}

// Tijd per gebeurtenis op de hoofdthread van de pagina (stijl, layout, tekenen, scripts, GPU-wachttijd).
function printTraceSummary(trace) {
  const events = Array.isArray(trace) ? trace : trace.traceEvents || [];
  const mainThreads = new Set(events.filter(function (event) {
    return event.ph === "M" && event.name === "thread_name" && event.args && event.args.name === "CrRendererMain";
  }).map(function (event) { return event.pid + ":" + event.tid; }));
  const totals = new Map();
  let frames = 0;
  let firstTs = Infinity;
  let lastTs = 0;
  for (const event of events) {
    if (event.name === "DrawFrame" || event.name === "Commit") { if (event.name === "DrawFrame") frames += 1; }
    if (event.ph !== "X" || !mainThreads.has(event.pid + ":" + event.tid)) continue;
    firstTs = Math.min(firstTs, event.ts);
    lastTs = Math.max(lastTs, event.ts + (event.dur || 0));
    const entry = totals.get(event.name) || { ms: 0, count: 0, max: 0 };
    entry.ms += (event.dur || 0) / 1000;
    entry.count += 1;
    entry.max = Math.max(entry.max, (event.dur || 0) / 1000);
    totals.set(event.name, entry);
  }
  const spanMs = Math.max(1, (lastTs - firstTs) / 1000);
  console.log("Trace hoofdthread, " + Math.round(spanMs) + " ms, DrawFrame-events: " + frames + " (~" + (frames / (spanMs / 1000)).toFixed(1) + " fps)");
  Array.from(totals.entries()).sort(function (a, b) { return b[1].ms - a[1].ms; }).slice(0, 25).forEach(function ([name, entry]) {
    console.log("  " + entry.ms.toFixed(0).padStart(7) + " ms  x" + String(entry.count).padEnd(6) + " max " + entry.max.toFixed(1).padStart(6) + " ms  " + name);
  });
}

async function main() {
  requireIsolatedMode();
  const sourceDb = process.env.GK_WORLD_SOURCE_DB;
  if (!sourceDb) throw new Error("Zet GK_WORLD_SOURCE_DB=<pad naar bron-database> (wordt alleen-lezen geopend).");
  const sourceAssets = path.resolve(rootDir, process.env.GK_WORLD_SOURCE_ASSETS || "assets");
  const runtime = await createIsolatedRuntime(rootDir, "world-profile");
  let server = null;
  let browser = null;
  try {
    const counts = await copyWorldIntoTempDatabase(sourceDb, runtime);
    console.log("Wereldtabellen gekopieerd: " + JSON.stringify(counts));
    if (fs.existsSync(sourceAssets)) fs.cpSync(sourceAssets, runtime.assetsPath, { recursive: true, force: true });
    BASE = "http://127.0.0.1:" + runtime.port;
    server = spawn(process.execPath, ["src/server/server.js"], { cwd: rootDir, env: runtime.env({ ADMIN_USERNAME: "profile_admin", ADMIN_PASSWORD: crypto.randomBytes(18).toString("hex") }), stdio: ["ignore", "ignore", "pipe"] });
    server.stderr.on("data", function (data) { process.stderr.write("[server] " + data); });
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try { if ((await fetch(BASE + "/api/health")).status === 200) break; } catch {}
      await sleep(500);
    }
    const register = await call("POST", "/api/auth/register", { identifier: "profile_player", password: "profile_password", deviceLabel: "profile" });
    if (register.status !== 201) throw new Error("Testaccount registreren mislukt: " + register.status + " " + register.text);
    const puppeteerModule = await import("puppeteer");
    const puppeteer = puppeteerModule.default || puppeteerModule;
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768, deviceScaleFactor: 1 });
    const separator = cookie.indexOf("=");
    await page.setCookie({ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: BASE });
    await page.goto(BASE + "/game/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(function () { return Boolean(window.__GK_GAME_RUNTIME && window.__GK_GAME_CLIENT_DEBUG); }, { timeout: 180000 });
    await sleep(8000);
    const traceMode = process.env.GK_PROFILE_MODE === "trace";
    const session = await page.target().createCDPSession();
    if (traceMode) {
      await page.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "blink", "gpu"] });
    } else {
      await session.send("Profiler.enable");
      await session.send("Profiler.setSamplingInterval", { interval: 1000 });
      await session.send("Profiler.start");
    }
    const timingSamples = [];
    for (const [key, holdMs] of WALK_PLAN) {
      await page.keyboard.down(key);
      const until = Date.now() + holdMs;
      while (Date.now() < until) {
        await sleep(250);
        timingSamples.push(await page.evaluate(function () { return window.__GK_GAME_CLIENT_DEBUG.getGameLoopTimings(); }));
      }
      await page.keyboard.up(key);
      await sleep(300);
    }
    if (traceMode) {
      const trace = JSON.parse(Buffer.from(await page.tracing.stop()).toString("utf8"));
      printTraceSummary(trace);
      const fps = await page.evaluate(function () { return window.__GK_GAME_CLIENT_DEBUG.getGameLoopTimings(); });
      console.log("Game-loop timings na lopen: " + JSON.stringify(fps));
      return;
    }
    const { profile } = await session.send("Profiler.stop");
    if (process.env.GK_PROFILE_OUT) fs.writeFileSync(process.env.GK_PROFILE_OUT, JSON.stringify(profile));
    const summary = summarizeProfile(profile);
    const keys = Object.keys(timingSamples[timingSamples.length - 1] || {}).filter(function (key) { return /Ms$/.test(key); });
    const maxByKey = {};
    for (const key of keys) maxByKey[key] = Math.max.apply(null, timingSamples.map(function (sample) { return Number(sample[key]) || 0; }));
    console.log("Game-loop timings (maximum tijdens lopen): " + JSON.stringify(maxByKey));
    console.log("CPU-profiel tijdens lopen, totaal " + summary.totalMs + " ms. Zwaarste functies (eigen tijd):");
    for (const line of summary.top) console.log("  " + line);
  } finally {
    if (browser) await browser.close().catch(function () {});
    if (server) server.kill("SIGTERM");
    await sleep(500);
    runtime.cleanup();
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
