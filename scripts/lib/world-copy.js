// Gedeelde opzet voor tests op een KOPIE van een echte wereld, in een afgeschermde testserver.
//
// Kopieert alleen wereldtabellen en assetbestanden naar een tijdelijke map. Accounts, sessies en
// spelergegevens gaan nooit mee; verwijzingen naar gebruikers worden leeggemaakt. De bron-database wordt
// alleen-lezen geopend. Gebruik dit alleen met Kevins toestemming (zie README/TESTEN.md).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createIsolatedRuntime, requireIsolatedMode } from "./test-isolation.js";

export const WORLD_TABLES = ["editor_nodes", "editor_node_edges", "asset_library", "published_world_state", "editor_graph_meta", "content_id_aliases", "game_hud_layout_defaults"];
const USER_REFERENCE_COLUMNS = new Set(["updated_by_user_id", "created_by_user_id", "user_id", "owner_user_id"]);

export function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

async function copyWorldIntoTempDatabase(rootDir, sourcePath, runtime) {
  process.env.DATABASE_PATH = runtime.databasePath;
  process.env.ASSETS_PATH = runtime.assetsPath;
  const { openDatabase } = await import("../../src/server/db.js");
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

// Alleen in de tijdelijke kopie: een andere netwerkpreset uitproberen, zonder de echte wereld te raken.
async function applyNetworkPresetToCopy(databasePath, preset) {
  const { mmoNetworkPresetValues } = await import("../../src/shared/node-types.js");
  const values = mmoNetworkPresetValues(preset);
  if (!values) throw new Error("Onbekende netwerkpreset: " + preset);
  const db = new DatabaseSync(databasePath);
  try {
    for (const row of db.prepare("SELECT id, world_json FROM published_world_state").all()) {
      const world = JSON.parse(row.world_json);
      world.mmo = world.mmo || {};
      world.mmo.network = Object.assign({}, world.mmo.network || {}, values, { networkPreset: preset });
      db.prepare("UPDATE published_world_state SET world_json = ? WHERE id = ?").run(JSON.stringify(world), row.id);
    }
  } finally {
    db.close();
  }
}

// Start een testserver met een kopie van de wereld. Geeft { base, runtime, counts, stop() } terug.
export async function startWorldCopyServer(rootDir, label) {
  requireIsolatedMode();
  const sourceDb = process.env.GK_WORLD_SOURCE_DB;
  if (!sourceDb) throw new Error("Zet GK_WORLD_SOURCE_DB=<pad naar bron-database> (wordt alleen-lezen geopend).");
  const sourceAssets = path.resolve(rootDir, process.env.GK_WORLD_SOURCE_ASSETS || "assets");
  const runtime = await createIsolatedRuntime(rootDir, label);
  let server = null;
  try {
    const counts = await copyWorldIntoTempDatabase(rootDir, sourceDb, runtime);
    if (fs.existsSync(sourceAssets)) fs.cpSync(sourceAssets, runtime.assetsPath, { recursive: true, force: true });
    if (process.env.GK_WORLD_COPY_NETWORK_PRESET) await applyNetworkPresetToCopy(runtime.databasePath, process.env.GK_WORLD_COPY_NETWORK_PRESET);
    const base = "http://127.0.0.1:" + runtime.port;
    server = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: runtime.env({ ADMIN_USERNAME: "profile_admin", ADMIN_PASSWORD: crypto.randomBytes(18).toString("hex") }),
      stdio: ["ignore", "ignore", "pipe"]
    });
    server.stderr.on("data", function (data) { process.stderr.write("[server] " + data); });
    let healthy = false;
    for (let attempt = 0; attempt < 120 && !healthy; attempt += 1) {
      try { healthy = (await fetch(base + "/api/health")).status === 200; } catch {}
      if (!healthy) await sleep(500);
    }
    if (!healthy) throw new Error("Testserver werd niet gezond.");
    return {
      base,
      runtime,
      counts,
      async stop() {
        if (server) server.kill("SIGTERM");
        server = null;
        await sleep(500);
        runtime.cleanup();
      }
    };
  } catch (error) {
    if (server) server.kill("SIGTERM");
    runtime.cleanup();
    throw error;
  }
}

// Registreert een nep-account en geeft de sessiecookie terug (naam=waarde).
export async function registerTestPlayer(base, identifier) {
  const response = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { Origin: base, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: identifier + "_password", deviceLabel: identifier })
  });
  if (response.status !== 201) throw new Error("Testaccount registreren mislukt: " + response.status + " " + await response.text());
  const raw = response.headers.get("set-cookie") || "";
  return raw.split(";")[0];
}

export async function openGameAs(browser, base, cookie, viewport = { width: 1366, height: 768 }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport(Object.assign({ deviceScaleFactor: 1 }, viewport));
  const separator = cookie.indexOf("=");
  await page.setCookie({ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: base });
  await page.goto(base + "/game/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(function () {
    const debug = window.__GK_GAME_CLIENT_DEBUG;
    return Boolean(window.__GK_GAME_RUNTIME && debug && debug.getPositions && debug.getPositions().authoritative);
  }, { timeout: 180000 });
  return page;
}
