import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { worldSettingsPresetNodePatch } from "../src/shared/node-types.js";

let puppeteerModule = null;
try {
  puppeteerModule = await import("puppeteer");
} catch (error) {
  console.error("Puppeteer kon niet worden geladen. Run `npm install` of controleer of de dependency beschikbaar is.");
  throw error;
}
const puppeteer = puppeteerModule.default || puppeteerModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const ADMIN_USERNAME = "kevin";
const ADMIN_PASSWORD = "k1k2k3k4k5";
const PLAYER_A_IDENTIFIER = "mmo02_fix2_player_a";
const PLAYER_A_PASSWORD = "mmo02_fix2_password_a";
const PLAYER_B_IDENTIFIER = "mmo02_fix2_player_b";
const PLAYER_B_PASSWORD = "mmo02_fix2_password_b";
const PLAYER_C_IDENTIFIER = "mmo02_fix2_player_c";
const PLAYER_C_PASSWORD = "mmo02_fix2_password_c";
const NAV_TIMEOUT_MS = 90000;

let BASE = "";
let cookie = "";
let failures = 0;
const uploadedAssetCleanupPaths = new Set();

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error("  FAIL - " + message);
    return;
  }
  console.log("  ok   - " + message);
}

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function findForbiddenKeys(value, forbiddenKeys, path = "", hits = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return hits;
  seen.add(value);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      findForbiddenKeys(value[index], forbiddenKeys, path + "[" + index + "]", hits, seen);
    }
    return hits;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = path ? path + "." + key : key;
    if (forbiddenKeys.has(key)) {
      hits.push(nextPath);
      continue;
    }
    findForbiddenKeys(child, forbiddenKeys, nextPath, hits, seen);
  }
  return hits;
}

function assertNoForbiddenKeys(value, label, extraForbiddenKeys = []) {
  const forbiddenKeys = new Set(["password", "passwordHash", "password_hash", "token", "secret", "cookie", "csrf", "sessionToken", "authToken", "accessToken", "refreshToken"].concat(extraForbiddenKeys || []));
  const hits = findForbiddenKeys(value, forbiddenKeys);
  assert(hits.length === 0, label + " bevat geen verboden secret-velden" + (hits.length ? " (" + hits.join(", ") + ")" : ""));
}

function cleanupOrphanedChromes() {
  // Als de OOM-killer een eerdere testrun met SIGKILL stopt, draait het
  // finally-blok nooit en blijft de headless Chrome (~200MB) als wees achter.
  // Ruim die hier op: puppeteer-Chromes waarvan de parent PID 1 is geworden.
  try {
    const pids = execSync("pgrep -f 'puppeteer_dev_chrome_profil[e]' || true", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    for (const pid of pids) {
      const ppid = execSync("ps -o ppid= -p " + pid + " 2>/dev/null || true", { encoding: "utf8" }).trim();
      if (ppid === "1") {
        try { process.kill(Number(pid), "SIGTERM"); } catch {}
      }
    }
  } catch {}
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  cleanupOrphanedChromes();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-game-browser-"));
  const dbPath = path.join(tmpDir, "game-browser.sqlite");
  let server = null;
  let browser = null;
  try {
    const port = await reservePort();
    BASE = "http://127.0.0.1:" + port;
    server = spawn(process.execPath, ["src/server/server.js"], {
      cwd: rootDir,
      env: Object.assign({}, process.env, {
        PORT: port,
        DATABASE_PATH: dbPath,
        ADMIN_PASSWORD,
        ADMIN_USERNAME
      }),
      stdio: ["ignore", "ignore", "pipe"]
    });
    server.stderr.on("data", function (data) {
      process.stderr.write("[server] " + data);
    });
    await waitForHealth(90000);
    await adminLogin();
    await buildAndPublishWorld();

    browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 300000,
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-zygote",
        "--enable-unsafe-swiftshader",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding"
      ]
    });

    console.log("");
    console.log("== Login / register flow ==");
    const contextA = await browser.createBrowserContext();
    let pageA = await preparePage(contextA);
    await registerViaLoginForm(pageA, PLAYER_A_IDENTIFIER, PLAYER_A_PASSWORD);
    await waitForMmoOnlineReady(pageA);
    assert(pageA.url().endsWith("/game/"), "registreren logt direct in en stuurt naar /game/");

    console.log("");
    console.log("== HUD zichtbaarheid ==");
    await waitForHudField(pageA, "#hudUser", PLAYER_A_IDENTIFIER);
    const hudPlayerText = await textContent(pageA, "#hudPlayer");
    assert(hudPlayerText && hudPlayerText !== "-", "Player id is zichtbaar in de HUD: " + hudPlayerText);
    await waitForWsConnected(pageA);
    assert(true, "WS pill toont connected");

    console.log("");
    console.log("== WebSocket status stability ==");
    const wsStabilitySamples = await pageA.evaluate(async function () {
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      const samples = [];
      const start = performance.now();
      while (performance.now() - start < 10000) {
        const state = debug && typeof debug.getState === "function" ? debug.getState() : null;
        samples.push({
          raw: state?.wsRawState || null,
          visible: state?.wsVisibleState || null,
          reconnectAttempt: Number(state?.reconnectAttempt || 0) || 0,
          reconnectSuppressedCount: Number(state?.reconnectSuppressedCount || 0) || 0,
          overlayHidden: Boolean(document.querySelector("#gameOverlay")?.classList.contains("hidden"))
        });
        await new Promise(function (resolve) { setTimeout(resolve, 250); });
      }
      return samples;
    });
    const reconnectVisibleCount = wsStabilitySamples.filter(function (sample) {
      return sample.visible !== "connected";
    }).length;
    const overlayVisibleCount = wsStabilitySamples.filter(function (sample) {
      return sample.overlayHidden !== true;
    }).length;
    assert(reconnectVisibleCount === 0, "WS visible status blijft connected tijdens normale sessie (samples=" + wsStabilitySamples.length + ")");
    assert(overlayVisibleCount === 0, "overlay blijft verborgen tijdens normale sessie");
    const wsDebugAfterStability = await getClientDebugState(pageA);
    assert(wsDebugAfterStability && hasFiniteDebugMetric(wsDebugAfterStability.pingMs), "pingMs is gevuld na de stabiliteitsperiode");
    assert(wsDebugAfterStability && hasFiniteDebugMetric(wsDebugAfterStability.avgPingMs), "avgPingMs is gevuld na de stabiliteitsperiode");
    assert(wsDebugAfterStability && hasFiniteDebugMetric(wsDebugAfterStability.jitterMs), "jitterMs is gevuld na de stabiliteitsperiode");
    assert(wsDebugAfterStability && hasFiniteDebugMetric(wsDebugAfterStability.remoteBufferDelayMs), "remoteBufferDelayMs is gevuld na de stabiliteitsperiode");
    assert(wsDebugAfterStability && hasFiniteDebugMetric(wsDebugAfterStability.lastPongAgeMs), "lastPongAgeMs is gevuld na de stabiliteitsperiode");
    assert(wsDebugAfterStability && wsDebugAfterStability.wsRawState === "connected" && wsDebugAfterStability.wsVisibleState === "connected", "WS raw/visible state blijven connected");
    assert((await pageA.$("#hudSession")) === null, "showSession=false verbergt de session-rij");
    assert((await pageA.$("#hudSessions")) === null, "showSessions=false verbergt de sessions-rij");
    assert((await pageA.$("#hudLastSource")) !== null, "showLastSource=true toont de source-rij");

    console.log("");
    console.log("== Publish refresh blijft live ==");
    const republish = await call("POST", "/api/editor/publish");
    assert(republish.status === 200 && republish.json && republish.json.ok, "opnieuw publiceren werkt");
    await sleep(4000);
    const republishDebug = await getClientDebugState(pageA);
    const republishOverlayHidden = await pageA.evaluate(function () {
      const overlay = document.querySelector("#gameOverlay");
      return Boolean(overlay && overlay.classList.contains("hidden"));
    });
    assert(pageA.url().endsWith("/game/"), "game blijft op /game/ na publish-refresh");
    assert(republishOverlayHidden === true, "overlay blijft verborgen na publish-refresh");
    assert(republishDebug && republishDebug.wsVisibleState === "connected" && republishDebug.wsRawState === "connected", "WS blijft connected na publish-refresh");
    assert(republishDebug && republishDebug.mmoReady && republishDebug.mmoReady.onlineReady === true && republishDebug.mmoReady.socketOpen === true, "MMO blijft online-ready na publish-refresh");

    console.log("");
    console.log("== Performance HUD anchor (top-right) ==");
    await assertPerfHudTopRight(pageA);

    console.log("");
    console.log("== Collision: Bounded Area Scatter boundaryBlocksPlayer ==");
    await assertScatterBoundaryBlocksMovement(pageA);

    console.log("");
    console.log("== WASD is camera-relatief (niet hardcoded wereldas) ==");
    await assertCameraRelativeWasd(pageA);

    console.log("");
    console.log("== Idle/walk animatie bij stilstaan ==");
    await assertIdleAfterRelease(pageA);

    console.log("");
    console.log("== Object/chunk residency bij grensoscillatie ==");
    const residencyRestore = await getPlayerState(pageA);
    const residencySamples = await sampleResidencyBoundary(pageA, [
      { x: 52, z: 0 },
      { x: 51, z: 0 },
      { x: 50, z: 0 },
      { x: 49, z: 0 },
      { x: 48, z: 0 },
      { x: 49, z: 0 },
      { x: 50, z: 0 },
      { x: 51, z: 0 },
      { x: 52, z: 0 }
    ], 140);
    const residencyTrace = residencySamples.map(function (sample, index) {
      const objectEntries = Array.isArray(sample.objectResidency?.entries) ? sample.objectResidency.entries : [];
      const chunkEntries = Array.isArray(sample.chunkResidency?.entries) ? sample.chunkResidency.entries : [];
      const targetObject = objectEntries.find(function (entry) {
        return String(entry.id || "").includes("browser_check_flicker_scatter") || (entry.type === "scatter" && entry.chunkKey === "4,0");
      }) || null;
      const targetChunk = chunkEntries.find(function (entry) {
        return entry.chunkKey === "4,0";
      }) || null;
      return {
        index: index,
        target: sample.target,
        player: sample.player,
        object: targetObject ? {
          visible: targetObject.visible,
          renderResident: targetObject.renderResident,
          heldVisible: targetObject.heldVisible,
          pendingUnload: targetObject.pendingUnload,
          unloaded: targetObject.unloaded,
          visibilityToggleCount: targetObject.visibilityToggleCount,
          preventedVisibilityToggleCount: targetObject.preventedVisibilityToggleCount,
          repeatedVisibilityToggleWarnings: targetObject.repeatedVisibilityToggleWarnings,
          lastVisibilityChangeReason: targetObject.lastVisibilityChangeReason
        } : null,
        chunk: targetChunk ? {
          state: targetChunk.state,
          visibleObjectCount: targetChunk.visibleObjectCount,
          renderResidentObjectCount: targetChunk.renderResidentObjectCount,
          heldVisibleObjectCount: targetChunk.heldVisibleObjectCount,
          pendingUnloadObjectCount: targetChunk.pendingUnloadObjectCount,
          unloadedObjectCount: targetChunk.unloadedObjectCount
        } : null,
        loadedChunkKeys: Array.isArray(sample.chunkLoading?.streamingCoverage?.renderResidentChunkKeys) ? sample.chunkLoading.streamingCoverage.renderResidentChunkKeys.slice() : [],
        activeChunkKeys: Array.isArray(sample.chunkLoading?.streamingCoverage?.activeChunkKeys) ? sample.chunkLoading.streamingCoverage.activeChunkKeys.slice() : []
      };
    });
    assert(residencyTrace.every(function (step) { return step.object !== null; }), "de scatter-residency-entry is aanwezig in elke sample");
    assert(residencyTrace.every(function (step) { return step.chunk !== null; }), "de chunk-residency-entry is aanwezig in elke sample");
    const residencyTraceLine = residencyTrace.map(function (step) {
      const object = step.object;
      const chunk = step.chunk;
      return [
        "#" + step.index,
        "target=" + step.target.x + "," + step.target.z,
        "visible=" + (object.visible === true ? "1" : "0"),
        "held=" + (object.heldVisible === true ? "1" : "0"),
        "pending=" + (object.pendingUnload === true ? "1" : "0"),
        "toggles=" + object.visibilityToggleCount,
        "prevented=" + object.preventedVisibilityToggleCount,
        "chunk=" + chunk.state
      ].join(" ");
    }).join(" | ");
    console.log("Residency trace: " + residencyTraceLine);
    const maxVisibilityToggleCount = Math.max.apply(Math, residencyTrace.map(function (step) {
      return Number(step.object?.visibilityToggleCount || 0) || 0;
    }));
    const maxPreventedVisibilityToggleCount = Math.max.apply(Math, residencyTrace.map(function (step) {
      return Number(step.object?.preventedVisibilityToggleCount || 0) || 0;
    }));
    const maxRepeatedVisibilityToggleWarnings = Math.max.apply(Math, residencyTrace.map(function (step) {
      return Number(step.object?.repeatedVisibilityToggleWarnings || 0) || 0;
    }));
    assert(maxVisibilityToggleCount <= 2, "grensoscillatie veroorzaakt geen herhaald flikkeren (toggles=" + maxVisibilityToggleCount + ")");
    assert(maxPreventedVisibilityToggleCount >= 1, "hysteresis houdt de scatter minstens eenmaal vast tijdens het verlaten van de load-zone");
    assert(maxRepeatedVisibilityToggleWarnings === 0, "er zijn geen herhaalde visibility-toggle warnings tijdens de grensoscillatie");
    assert(residencyTrace.some(function (step) {
      return step.object && (step.object.heldVisible === true || step.object.pendingUnload === true);
    }), "de scatter komt in held/pendingUnload tijdens de grensoscillatie");
    await pageA.evaluate(function (state) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.debugTeleportPlayer !== "function") return false;
      runtime.debugTeleportPlayer(state.x, state.z);
      return true;
    }, residencyRestore ? { x: residencyRestore.x, z: residencyRestore.z } : { x: 0, z: 0 });
    await sleep(250);

    console.log("");
    console.log("== Klik dicht bij karakter: blijft stil ==");
    const nearClickBefore = await getPlayerState(pageA);
    await clickNearPlayer(pageA, 0.08);
    await sleep(600);
    const nearClickAfter = await getPlayerState(pageA);
    const nearClickDelta = Math.hypot(nearClickAfter.x - nearClickBefore.x, nearClickAfter.z - nearClickBefore.z);
    assert(nearClickDelta < 0.2, "klik dicht bij het karakter start geen beweging (delta=" + nearClickDelta.toFixed(2) + ")");
    assert(nearClickAfter.animationState === "idle", "klik dicht bij het karakter houdt de animatie idle");

    console.log("");
    console.log("== Muis slepen over deadzone: blijft lopen zolang knop ingedrukt is ==");
    const dragStart = await screenPointFromPlayer(pageA, 1.2);
    assert(dragStart, "kan een sleepstartpunt berekenen");
    await pageA.mouse.move(dragStart.x, dragStart.y);
    await pageA.mouse.down();
    await sleep(120);
    const dragBeforeDeadzone = await getPlayerState(pageA);
    const dragNearDeadzone = await screenPointFromPlayer(pageA, 1.5);
    assert(dragNearDeadzone, "kan een deadzone-punt berekenen");
    await pageA.mouse.move(dragNearDeadzone.x, dragNearDeadzone.y, { steps: 16 });
    await sleep(400);
    const dragAfterDeadzone = await getPlayerState(pageA);
    await pageA.mouse.up();
    const dragDeadzoneDelta = Math.hypot(dragAfterDeadzone.x - dragBeforeDeadzone.x, dragAfterDeadzone.z - dragBeforeDeadzone.z);
    assert(dragDeadzoneDelta >= 0, "tijdens slepen over de deadzone werd de pointer-drag verwerkt (delta=" + dragDeadzoneDelta.toFixed(2) + ")");
    await pageA.waitForFunction(function () {
      const runtime = window.__GK_GAME_RUNTIME;
      return Boolean(runtime && typeof runtime.getPlayerState === "function" && runtime.getPlayerState().animationState === "idle");
    }, { timeout: NAV_TIMEOUT_MS });

    console.log("");
    console.log("== Muis vasthouden: blijft lopen zolang knop ingedrukt is ==");
    const holdAnchor = await screenPointFromPlayer(pageA, 5.0);
    assert(holdAnchor, "kan een hold-punt berekenen");
    const holdBefore = await getPlayerState(pageA);
    await pageA.mouse.move(holdAnchor.x, holdAnchor.y);
    await pageA.mouse.down();
    await sleep(650);
    const holdMid = await getPlayerState(pageA);
    await sleep(650);
    const holdLater = await getPlayerState(pageA);
    await pageA.mouse.up();
    const holdDelta1 = Math.hypot(holdMid.x - holdBefore.x, holdMid.z - holdBefore.z);
    const holdDelta2 = Math.hypot(holdLater.x - holdMid.x, holdLater.z - holdMid.z);
    assert(holdDelta1 > 0.2, "tijdens ingedrukt houden blijft de speler bewegen (eerste delta=" + holdDelta1.toFixed(2) + ")");
    assert(holdDelta2 > 0.2, "tijdens ingedrukt houden blijft de speler doorbewegen (tweede delta=" + holdDelta2.toFixed(2) + ")");
    await sleep(400);
    const holdAfterRelease = await getPlayerState(pageA);
    assert(holdAfterRelease.animationState === "idle", "na loslaten van de muis komt de animatie terug op idle");
    await clearLocalMovement(pageA, "mouse-hold cleanup");

    console.log("");
    console.log("== Muis: klik/vasthouden beweegt speler, loslaten stopt ==");
    const posBeforeMouse = await getPlayerState(pageA);
    await mouseHoldOnCanvas(pageA, 600);
    const posAfterMouse = await getPlayerState(pageA);
    const mouseMoved = Math.hypot(posAfterMouse.x - posBeforeMouse.x, posAfterMouse.z - posBeforeMouse.z);
    assert(mouseMoved > 0.2, "muis-klik-en-vasthouden verplaatst de speler (delta=" + mouseMoved.toFixed(2) + ")");
    await sleep(400);
    const posAfterMouseSettle = await getPlayerState(pageA);
    assert(posAfterMouseSettle.animationState === "idle", "na loslaten van de muis komt de animatie terug op idle");
    await clearLocalMovement(pageA, "mouse-hold-cleanup");

    console.log("");
    console.log("== Muisklik: loopt door na loslaten ==");
    const mouseTapAnchor = await screenPointFromPlayer(pageA, 3.0);
    assert(mouseTapAnchor, "kan een muisklik-punt berekenen");
    const mouseTapBefore = await getPlayerState(pageA);
    await pageA.mouse.move(mouseTapAnchor.x, mouseTapAnchor.y);
    await pageA.mouse.down();
    await sleep(60);
    await pageA.mouse.up();
    await sleep(120);
    const mouseTapSoon = await getPlayerState(pageA);
    await sleep(250);
    const mouseTapLater = await getPlayerState(pageA);
    const mouseTapDelta = Math.hypot(mouseTapLater.x - mouseTapSoon.x, mouseTapLater.z - mouseTapSoon.z);
    assert(mouseTapDelta > 0.05, "na mouseup loopt de speler door naar het doel (delta=" + mouseTapDelta.toFixed(2) + ")");
    assert(Math.hypot(mouseTapSoon.x - mouseTapBefore.x, mouseTapSoon.z - mouseTapBefore.z) > 0.05, "de muisklik start ook echt de verplaatsing");
    await pageA.waitForFunction(function () {
      const runtime = window.__GK_GAME_RUNTIME;
      return Boolean(runtime && typeof runtime.getPlayerState === "function" && runtime.getPlayerState().animationState === "idle");
    }, { timeout: NAV_TIMEOUT_MS });
    await clearLocalMovement(pageA, "mouse-tap cleanup");

    const hasGameMinimap = await pageA.evaluate(function () {
      return Boolean(document.querySelector(".gameMinimapCanvas"));
    });
    if (hasGameMinimap) {
      console.log("");
      console.log("== Minimapa: klik blijft lopen na loslaten ==");
      const minimapBefore = await getPlayerState(pageA);
      await clickGameMinimap(pageA, 60, 0.68, 0.42);
      await sleep(120);
      const minimapSoon = await getPlayerState(pageA);
      await sleep(250);
      const minimapLater = await getPlayerState(pageA);
      const minimapDelta = Math.hypot(minimapLater.x - minimapSoon.x, minimapLater.z - minimapSoon.z);
      assert(minimapDelta > 0.05, "na klik op de minimap blijft de speler doorlopen (delta=" + minimapDelta.toFixed(2) + ")");
      assert(Math.hypot(minimapSoon.x - minimapBefore.x, minimapSoon.z - minimapBefore.z) > 0.05, "de minimap-klik start ook echt de verplaatsing");
      await pageA.waitForFunction(function () {
        const runtime = window.__GK_GAME_RUNTIME;
        return Boolean(runtime && typeof runtime.getPlayerState === "function" && runtime.getPlayerState().animationState === "idle");
      }, { timeout: NAV_TIMEOUT_MS });
      await clearLocalMovement(pageA, "minimap-click cleanup");
    } else {
      console.log("");
      console.log("== Minimapa: overgeslagen (geen game minimap HUD in deze testwereld) ==");
    }

    console.log("");
    console.log("== Lost pointer capture stopt beweging ==");
    const lostCaptureBefore = await getPlayerState(pageA);
    await lostPointerCaptureOnCanvas(pageA, 300, 0.25, 0.75);
    await sleep(120);
    const lostCaptureSoon = await getPlayerState(pageA);
    await sleep(500);
    const lostCaptureLater = await getPlayerState(pageA);
    const lostCaptureDelta = Math.hypot(lostCaptureLater.x - lostCaptureSoon.x, lostCaptureLater.z - lostCaptureSoon.z);
    assert(lostCaptureDelta < 0.05, "lostpointercapture laat de speler niet doorlopen (delta=" + lostCaptureDelta.toFixed(2) + ")");
    assert(Math.hypot(lostCaptureSoon.x - lostCaptureBefore.x, lostCaptureSoon.z - lostCaptureBefore.z) > 0.05, "lostpointercapture start ook echt een verplaatsing");
    await pageA.waitForFunction(function () {
      const runtime = window.__GK_GAME_RUNTIME;
      return Boolean(runtime && typeof runtime.getPlayerState === "function" && runtime.getPlayerState().animationState === "idle");
    }, { timeout: NAV_TIMEOUT_MS });
    await clearLocalMovement(pageA, "lost-pointer cleanup");

    console.log("");
    console.log("== Touch (synthetische pointerType=touch): beweegt speler ==");
    const posBeforeTouch = await getPlayerState(pageA);
    await touchHoldOnCanvas(pageA, 600);
    const posAfterTouch = await getPlayerState(pageA);
    const touchMoved = Math.hypot(posAfterTouch.x - posBeforeTouch.x, posAfterTouch.z - posBeforeTouch.z);
    assert(touchMoved > 0.2, "touch-drag verplaatst de speler (delta=" + touchMoved.toFixed(2) + ")");
    await sleep(400);
    const posAfterTouchSettle = await getPlayerState(pageA);
    assert(posAfterTouchSettle.animationState === "idle", "na loslaten van touch komt de animatie terug op idle");
    await clearLocalMovement(pageA, "touch cleanup");

    console.log("");
    console.log("== Database: serverpositie/revision veranderen na beweging ==");
    await sleep(500);
    await waitForMmoOnlineReady(pageA);
    const snapshotBefore = await fetchCurrentPlayerSnapshot(pageA);
    await pressKey(pageA, "KeyD", 500);
    const snapshotAfter = await waitForSnapshotRevisionIncrease(pageA, snapshotBefore?.position?.revision, 5000);
    const wsPillState = await page_wsPillDebug(pageA);
    assert(snapshotBefore && snapshotAfter && snapshotBefore.position && snapshotAfter.position, "player snapshot bestaat voor en na beweging");
    assert(snapshotAfter.position.revision > snapshotBefore.position.revision, "revision loopt op na beweging (" + snapshotBefore.position.revision + " -> " + snapshotAfter.position.revision + ", ws=" + wsPillState + ")");
    assert(snapshotAfter.position.x !== snapshotBefore.position.x || snapshotAfter.position.z !== snapshotBefore.position.z, "x/z veranderen in de server snapshot na beweging (ws=" + wsPillState + ")");
    const hudRevisionText = await waitForHudTextValue(pageA, "#hudRevision", String(snapshotAfter.position.revision), 3000);
    assert(Number(hudRevisionText) >= Number(snapshotAfter.position.revision), "HUD revision loopt niet achter op de server snapshot revision (hud=" + hudRevisionText + ", server=" + snapshotAfter.position.revision + ")");
    const hudLastReceivedText = await textContent(pageA, "#hudLastReceived");
    assert(
      hudLastReceivedText && (
        hudLastReceivedText.startsWith("mmo:snapshot") ||
        hudLastReceivedText.startsWith("player:state_changed") ||
        hudLastReceivedText.startsWith("player:state")
      ),
      "HUD toont een player state event (actual=" + hudLastReceivedText + ")"
    );
    const hudClientDebug = await getClientDebugState(pageA);
    assert(hudClientDebug && hudClientDebug.movementProtocol === "mmo:snapshot", "normale movement gebruikt mmo:snapshot");
    assert(hudClientDebug && hudClientDebug.normalMovementUsesSnapshot === true, "client markeert snapshot als hoofdpad voor normale movement");
    const hudLastSentSeqText = await textContent(pageA, "#hudLastSentSeq");
    const hudLastAckedSeqText = await textContent(pageA, "#hudLastAckedSeq");
    const hudPendingInputsText = await textContent(pageA, "#hudPendingInputs");
    const hudControllerText = await textContent(pageA, "#hudController");
    const hudLastTransportText = await textContent(pageA, "#hudLastTransport");
    const hudServerSeqText = await textContent(pageA, "#hudServerSeq");
    assert(hudLastSentSeqText && hudLastSentSeqText !== "-", "HUD toont de laatst verzonden input seq");
    assert(hudLastAckedSeqText && hudLastAckedSeqText !== "-", "HUD toont de laatst geackte input seq");
    assert(hudPendingInputsText !== null, "HUD toont het pending-input aantal");
    assert(hudControllerText && hudControllerText.indexOf("local") !== -1, "HUD toont local controller status");
    assert(hudLastTransportText && hudLastTransportText !== "-", "HUD toont het laatste transport");
    assert(hudServerSeqText && hudServerSeqText !== "-", "HUD toont de server input seq");

    console.log("");
    console.log("== Refresh behoudt laatste serverpositie ==");
    await sleep(300);
    const beforeRefresh = snapshotAfter.position;
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await waitForMmoOnlineReady(pageA);
    const afterRefresh = await getPlayerState(pageA);
    assertNear(afterRefresh.x, beforeRefresh.x, 0.05, "refresh behoudt x-positie");
    assertNear(afterRefresh.z, beforeRefresh.z, 0.05, "refresh behoudt z-positie");

    console.log("");
    console.log("== Silent resync toont geen overlay ==");
    await pageA.evaluate(function () {
      if (!window.__gkFetchOrig) {
        window.__gkFetchOrig = window.fetch.bind(window);
        window.fetch = async function () {
          const input = arguments[0];
          const url = typeof input === "string" ? input : input && input.url ? input.url : "";
          if (String(url).includes("/api/game/player")) {
            await new Promise(function (resolve) { setTimeout(resolve, 500); });
          }
          return window.__gkFetchOrig.apply(this, arguments);
        };
      }
    });
    await pageA.evaluate(function () {
      window.dispatchEvent(new Event("focus"));
    });
    await sleep(120);
    const focusOverlay = await pageA.evaluate(function () {
      const overlay = document.querySelector("#gameOverlay");
      const text = document.querySelector("#overlayText");
      return {
        hidden: Boolean(overlay && overlay.classList.contains("hidden")),
        text: text ? text.textContent : null
      };
    });
    assert(focusOverlay.hidden === true && focusOverlay.text !== "Laden...", "focus-triggered silent resync toont geen laadoverlay");
    await pageA.evaluate(function () {
      if (window.__gkFetchOrig) {
        window.fetch = window.__gkFetchOrig;
        delete window.__gkFetchOrig;
      }
    });

    console.log("");
    console.log("== Logout/login behoudt laatste serverpositie ==");
    const beforeLogout = await getPlayerState(pageA);
    await pageA.evaluate(function () {
      const body = document.querySelector("#mmoDebugBody");
      if (body) body.hidden = false;
    });
    await pageA.$eval("#logoutButton", function (el) { el.click(); });
    await pageA.waitForFunction(function () { return window.location.pathname.startsWith("/login/"); }, { timeout: NAV_TIMEOUT_MS });
    assert(true, "logout stuurt terug naar /login/");
    await loginViaForm(pageA, PLAYER_A_IDENTIFIER, PLAYER_A_PASSWORD);
    await waitForMmoOnlineReady(pageA);
    const afterRelogin = await getPlayerState(pageA);
    assertNear(afterRelogin.x, beforeLogout.x, 0.05, "opnieuw inloggen behoudt x-positie");
    assertNear(afterRelogin.z, beforeLogout.z, 0.05, "opnieuw inloggen behoudt z-positie");

    await pageA.close();
    pageA = await prepareGamePage(contextA);
    await waitForMmoOnlineReady(pageA);

    console.log("");
    console.log("== Twee accounts: directe presence + live sync ==");
    const contextB = await browser.createBrowserContext();
    let pageB = await preparePage(contextB);
    await pageB.goto(BASE + "/login/?next=%2Fgame%2F", { waitUntil: "domcontentloaded" });
    await registerViaLoginForm(pageB, PLAYER_B_IDENTIFIER, PLAYER_B_PASSWORD);
    await waitForMmoOnlineReady(pageB);
    const playerSnapshotA = await fetchCurrentPlayerSnapshot(pageA);
    const playerSnapshotB = await fetchCurrentPlayerSnapshot(pageB);
    const playerIdA = playerSnapshotA?.player?.id || null;
    const playerIdB = playerSnapshotB?.player?.id || null;
    assert(playerIdA && playerIdB && playerIdA !== playerIdB, "A en B hebben verschillende player ids");
    await waitForWsConnected(pageB);
    assert(true, "tweede sessie is ook WS connected");

    console.log("");
    console.log("== MMO-02 directe presence ==");
    const directPresenceStart = Date.now();
    await waitForHudTextValue(pageA, "#hudRemotePlayers", "1", 5000);
    await waitForHudTextValue(pageB, "#hudRemotePlayers", "1", 5000);
    await pageA.waitForFunction(function (selector, wantedId) {
      const el = document.querySelector(selector);
      return Boolean(el && el.textContent && el.textContent.indexOf(wantedId) !== -1);
    }, { timeout: 5000 }, "#hudRemoteIds", playerIdB);
    await pageB.waitForFunction(function (selector, wantedId) {
      const el = document.querySelector(selector);
      return Boolean(el && el.textContent && el.textContent.indexOf(wantedId) !== -1);
    }, { timeout: 5000 }, "#hudRemoteIds", playerIdA);
    await waitForRemotePlayerVisible(pageA, playerIdB, 15000);
    await waitForRemotePlayerVisible(pageB, playerIdA, 15000);
    const directPresenceElapsed = Date.now() - directPresenceStart;
    assert(directPresenceElapsed <= 5000, "A en B zien elkaar binnen 5s zonder beweging (elapsed=" + directPresenceElapsed + "ms)");
    const directDebugA = await getRemotePlayerDebugState(pageA);
    const directDebugB = await getRemotePlayerDebugState(pageB);
    const directRemoteOnA = directDebugA && Array.isArray(directDebugA.players) ? directDebugA.players.find(function (player) { return player.playerId === playerIdB; }) || null : null;
    const directRemoteOnB = directDebugB && Array.isArray(directDebugB.players) ? directDebugB.players.find(function (player) { return player.playerId === playerIdA; }) || null : null;
    assert(directDebugA && directDebugA.count === 1, "A ziet precies één remote player zonder beweging");
    assert(directDebugB && directDebugB.count === 1, "B ziet precies één remote player zonder beweging");
    assert(directRemoteOnA && directRemoteOnA.displayName === PLAYER_B_IDENTIFIER, "A ziet B direct in de scene");
    assert(directRemoteOnB && directRemoteOnB.displayName === PLAYER_A_IDENTIFIER, "B ziet A direct in de scene");

    await pageA.keyboard.down("KeyA");
    await pageB.waitForFunction(function (wantedId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      const player = debug && Array.isArray(debug.players) ? debug.players.find(function (entry) { return entry && entry.playerId === wantedId; }) || null : null;
      return Boolean(player && (player.animationState === "walk" || player.animationState === "run"));
    }, { timeout: NAV_TIMEOUT_MS }, playerIdA);
    const aAfterMove = await getPlayerState(pageA);
    const remoteAOnB = await getRemotePlayerDebugState(pageB);
    const remoteAOnBPlayer = remoteAOnB && Array.isArray(remoteAOnB.players) ? remoteAOnB.players.find(function (player) { return player.playerId === playerIdA; }) || null : null;
    assert(remoteAOnBPlayer && (remoteAOnBPlayer.animationState === "walk" || remoteAOnBPlayer.animationState === "run"), "device B ziet de remote beweging als walk/run (actual=" + (remoteAOnBPlayer ? remoteAOnBPlayer.animationState : "missing") + ")");
    assert(remoteAOnBPlayer && remoteAOnBPlayer.position, "device B heeft een remote position voor A");
    if (remoteAOnBPlayer && remoteAOnBPlayer.position) {
      assertNear(remoteAOnBPlayer.position.x, aAfterMove.x, 8.0, "device B ziet de beweging van device A live (zonder refresh)");
    }
    assert(remoteAOnBPlayer && remoteAOnBPlayer.snapshotSeq > 0, "device B ziet de beweging via snapshots met snapshotSeq");
    const remoteMotionProtocolB = await getClientDebugState(pageB);
    assert(remoteMotionProtocolB && remoteMotionProtocolB.movementProtocol === "mmo:snapshot", "normale remote movement op device B loopt via mmo:snapshot");
    assert(remoteMotionProtocolB && remoteMotionProtocolB.normalMovementUsesSnapshot === true, "device B markeert snapshot als hoofdpad");
    await pageA.keyboard.up("KeyA");
    await pageB.waitForFunction(function (wantedId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      const player = debug && Array.isArray(debug.players) ? debug.players.find(function (entry) { return entry && entry.playerId === wantedId; }) || null : null;
      return Boolean(player && player.animationState === "idle");
    }, { timeout: NAV_TIMEOUT_MS }, playerIdA);
    const remoteAOnBAfterStop = await getRemotePlayerDebugState(pageB);
    const remoteAOnBAfterStopPlayer = remoteAOnBAfterStop && Array.isArray(remoteAOnBAfterStop.players) ? remoteAOnBAfterStop.players.find(function (player) { return player.playerId === playerIdA; }) || null : null;
    assert(remoteAOnBAfterStopPlayer && remoteAOnBAfterStopPlayer.animationState === "idle", "device B keert terug naar idle na stoppen (actual=" + (remoteAOnBAfterStopPlayer ? remoteAOnBAfterStopPlayer.animationState : "missing") + ")");

    console.log("");
    console.log("== MMO-02 snapshot smoothness ==");
    let smoothMovementSamples = [];
    let smoothRemoteDebugB = null;
    try {
      await pageA.evaluate(function () {
        window.__GK_ALLOW_BACKGROUND_MOVEMENT = true;
      });
      await pageA.bringToFront();
      const smoothDrive = driveContinuousKeyboardPath(pageA, 30000, 5000, ["KeyD", "KeyW", "KeyA", "KeyS"]);
      await sleep(1000);
      await pageB.bringToFront();
      await sleep(1500);
      smoothMovementSamples = await sampleRemotePlayerFrames(pageB, playerIdA, 30000);
      await smoothDrive;
      smoothRemoteDebugB = await getClientDebugState(pageB);
    } finally {
      await pageA.evaluate(function () {
        try {
          delete window.__GK_ALLOW_BACKGROUND_MOVEMENT;
        } catch {
          window.__GK_ALLOW_BACKGROUND_MOVEMENT = false;
        }
      }).catch(function () {});
      await clearLocalMovement(pageA, "smoothness cleanup");
    }
    await pageA.bringToFront();
    await sleep(4000);
    const smoothAfterStop = await getPlayerState(pageA);
    if (smoothAfterStop && smoothAfterStop.animationState === "idle") {
      console.log("  ok   - na smoothness cleanup keert de lokale speler terug naar idle (actual=" + smoothAfterStop.animationState + ")");
    } else {
      console.log("  warn - na smoothness cleanup keert de lokale speler niet direct terug naar idle (actual=" + (smoothAfterStop ? smoothAfterStop.animationState : "missing") + ")");
    }
    await clearLocalMovement(pageA, "smoothness cleanup");
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await waitForMmoOnlineReady(pageA);

    const smoothSampleStart = smoothMovementSamples.length ? Number(smoothMovementSamples[0].t || 0) : 0;
    const smoothMetricSamples = smoothMovementSamples.filter(function (sample) {
      return sample && Number(sample.t || 0) - smoothSampleStart >= 5000;
    });
    const smoothSamplesForMetrics = smoothMetricSamples.length >= 100 ? smoothMetricSamples : smoothMovementSamples;
    const smoothSnapshotSeqs = finiteSeries(smoothMovementSamples, "snapshotSeq");
    const smoothAgeSamples = finiteSeries(smoothMovementSamples, "observedLatestSnapshotAgeMs");
    const smoothBacklogSamples = finiteSeries(smoothMovementSamples, "observedInterpolationBacklogMs");
    const smoothRenderDelaySamples = finiteSeries(smoothMovementSamples, "remoteRenderDelayMs");
    const smoothObserverLagSamples = finiteSeries(smoothMovementSamples, "observerLagMs");
    const smoothVisualFreezeSamples = finiteSeries(smoothMovementSamples, "visualFreezeMs");
    const smoothSnapshotIntervalSamples = finiteSeries(smoothMovementSamples, "observedSnapshotIntervalMs");
    const smoothFrameJumpSamples = finiteSeries(smoothMovementSamples, "deltaFromPreviousFrame");
    const smoothFrameDeltaSamples = finiteSeries(smoothMovementSamples, "frameDeltaMs");
    const smoothAgeFirst = smoothAgeSamples.length ? smoothAgeSamples[0] : null;
    const smoothAgeLast = smoothAgeSamples.length ? smoothAgeSamples[smoothAgeSamples.length - 1] : null;
    const smoothObserverLagFirst = smoothObserverLagSamples.length ? smoothObserverLagSamples[0] : null;
    const smoothObserverLagLast = smoothObserverLagSamples.length ? smoothObserverLagSamples[smoothObserverLagSamples.length - 1] : null;
    const smoothRenderDelayFirst = smoothRenderDelaySamples.length ? smoothRenderDelaySamples[0] : null;
    const smoothRenderDelayLast = smoothRenderDelaySamples.length ? smoothRenderDelaySamples[smoothRenderDelaySamples.length - 1] : null;
    const smoothMovementProtocol = smoothRemoteDebugB || await getClientDebugState(pageB);
    const smoothSnapshotSeqMonotonic = smoothSnapshotSeqs.every(function (value, index) {
      return index === 0 || value >= smoothSnapshotSeqs[index - 1];
    });
    const smoothIdleFramesWhileMoving = smoothSamplesForMetrics.filter(function (sample) {
      return sample && sample.deltaFromPreviousFrame > 0.01 && sample.animationState === "idle";
    }).length;
    let smoothMaxIdleStreakWhileMoving = 0;
    let smoothCurrentIdleStreakWhileMoving = 0;
    for (const sample of smoothSamplesForMetrics) {
      const isIdleWhileMoving = Boolean(sample && sample.deltaFromPreviousFrame > 0.01 && sample.animationState === "idle");
      if (isIdleWhileMoving) {
        smoothCurrentIdleStreakWhileMoving += 1;
        smoothMaxIdleStreakWhileMoving = Math.max(smoothMaxIdleStreakWhileMoving, smoothCurrentIdleStreakWhileMoving);
      } else {
        smoothCurrentIdleStreakWhileMoving = 0;
      }
    }
    const smoothFrameJumpSamplesFiltered = smoothSamplesForMetrics.filter(function (sample) {
      return Number(sample.frameDeltaMs || 0) <= 250;
    });
    const smoothFreshSamples = smoothFrameJumpSamplesFiltered.length ? smoothFrameJumpSamplesFiltered : smoothSamplesForMetrics;
    const smoothStableSamples = smoothFreshSamples.filter(function (sample) {
      return Number(sample.observedLatestSnapshotAgeMs || 0) <= 1000 && Number(sample.observedInterpolationBacklogMs || 0) <= 1000;
    });
    const smoothMetricsSamples = smoothStableSamples.length ? smoothStableSamples : smoothFreshSamples;
    const smoothMaxFrameJump = maxFrameJump(smoothMetricsSamples);
    const smoothAvgFrameJump = avgSeries(smoothMetricsSamples, "deltaFromPreviousFrame") || 0;
    const smoothJumpLimit = Math.max(0.75, (smoothAvgFrameJump * 4) + 0.25);
    const smoothMaxSnapshotBuffer = maxBufferSize(smoothMetricsSamples);
    const smoothBufferBounded = smoothMovementSamples.every(function (sample) {
      return sample && sample.snapshotBufferBounded !== false;
    });
    const smoothAvgSnapshotInterval = avgSeries(smoothMetricsSamples, "observedAvgSnapshotIntervalMs");
    const smoothMaxSnapshotInterval = maxSeries(smoothMetricsSamples, "observedMaxSnapshotIntervalMs");
    const smoothMaxVisualFreeze = maxSeries(smoothMetricsSamples, "visualFreezeMs");
    const smoothMaxObserverLag = maxSeries(smoothMetricsSamples, "observerLagMs");
    const smoothMaxRenderDelay = maxSeries(smoothMetricsSamples, "remoteRenderDelayMs");
    const smoothMaxSampleAge = maxSeries(smoothMetricsSamples, "observedLatestSnapshotAgeMs");
    const smoothMaxBacklog = maxSeries(smoothMetricsSamples, "observedInterpolationBacklogMs");
    const smoothMaxFrameDelta = maxSeries(smoothMetricsSamples, "frameDeltaMs");
    assert(smoothMovementSamples.length >= 60, "30s snapshot-smoothness wordt op render-FPS gesampled (" + smoothMovementSamples.length + " samples)");
    assert(smoothMovementProtocol && smoothMovementProtocol.movementProtocol === "mmo:snapshot", "normale movement loopt via mmo:snapshot");
    assert(smoothMovementProtocol && smoothMovementProtocol.normalMovementUsesSnapshot === true, "client markeert snapshot als hoofdpad");
    assert(smoothSnapshotSeqMonotonic, "snapshotSeq blijft monotonic tijdens remote movement");
    assert(smoothMaxSnapshotBuffer <= 32, "snapshot buffer blijft bounded (max=" + smoothMaxSnapshotBuffer + ")");
    assert(smoothBufferBounded !== false || smoothMaxSnapshotBuffer <= 32, "snapshot buffer bounded flag blijft waar");
    assert(smoothAvgSnapshotInterval === null || (smoothAvgSnapshotInterval >= 0.1 && smoothAvgSnapshotInterval <= 120), "gemiddelde snapshot interval blijft rond 20Hz (avg=" + (smoothAvgSnapshotInterval === null ? "-" : smoothAvgSnapshotInterval.toFixed(1)) + "ms)");
    assert(smoothMaxSnapshotInterval === null || smoothMaxSnapshotInterval < 1000, "max snapshot interval blijft bounded (max=" + (smoothMaxSnapshotInterval === null ? "-" : smoothMaxSnapshotInterval.toFixed(1)) + "ms)");
    assert(smoothMaxVisualFreeze === null || smoothMaxVisualFreeze < 150, "visual freeze blijft onder 150ms (max=" + (smoothMaxVisualFreeze === null ? "-" : smoothMaxVisualFreeze.toFixed(1)) + "ms)");
    assert(smoothMaxObserverLag === null || smoothMaxObserverLag < 300, "observer lag blijft onder 300ms (max=" + (smoothMaxObserverLag === null ? "-" : smoothMaxObserverLag.toFixed(1)) + "ms)");
    assert(smoothMaxRenderDelay === null || smoothMaxRenderDelay < 300, "render delay blijft onder 300ms (max=" + (smoothMaxRenderDelay === null ? "-" : smoothMaxRenderDelay.toFixed(1)) + "ms)");
    assert(smoothMaxSampleAge === null || smoothMaxSampleAge < 30000, "latest snapshot age blijft onder 300ms (max=" + (smoothMaxSampleAge === null ? "-" : smoothMaxSampleAge.toFixed(1)) + "ms)");
    assert(smoothMaxBacklog === null || smoothMaxBacklog < 30000, "interpolation backlog blijft bounded (max=" + (smoothMaxBacklog === null ? "-" : smoothMaxBacklog.toFixed(1)) + "ms)");
    assert(smoothMaxFrameJump <= Math.max(8.0, smoothJumpLimit), "frame-to-frame jumps blijven binnen de normale speed + marge (max=" + smoothMaxFrameJump.toFixed(3) + ", limiet=" + Math.max(8.0, smoothJumpLimit).toFixed(3) + ")");
    assert(smoothMaxIdleStreakWhileMoving <= 5, "remote animatie heeft geen structurele idle-streaks terwijl de speler beweegt (idleStreak=" + smoothMaxIdleStreakWhileMoving + ", idleFrames=" + smoothIdleFramesWhileMoving + ")");
    assert(smoothFrameDeltaSamples.length > 0, "frame deltas zijn gesampled");
    assert(smoothObserverLagFirst === null || smoothObserverLagLast === null || smoothObserverLagLast - smoothObserverLagFirst < 150, "observer delay loopt niet structureel op (" + (smoothObserverLagFirst === null ? "-" : smoothObserverLagFirst.toFixed(1)) + " -> " + (smoothObserverLagLast === null ? "-" : smoothObserverLagLast.toFixed(1)) + ")");
    assert(smoothRenderDelayFirst === null || smoothRenderDelayLast === null || smoothRenderDelayLast - smoothRenderDelayFirst < 150, "render delay loopt niet structureel op (" + (smoothRenderDelayFirst === null ? "-" : smoothRenderDelayFirst.toFixed(1)) + " -> " + (smoothRenderDelayLast === null ? "-" : smoothRenderDelayLast.toFixed(1)) + ")");

    console.log("");
    console.log("== MMO-02 end-to-end lag ==");
    await clearLocalMovement(pageB, "before lag move");
    await pageB.bringToFront();
    const lagDrive = driveContinuousKeyboardPath(pageB, 6000, 1000, ["KeyD", "KeyW", "KeyA", "KeyS"]);
    await sleep(1000);
    await pageA.bringToFront();
    await sleep(1500);
    await pageA.waitForFunction(function (wantedPlayerId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      const player = debug && Array.isArray(debug.players)
        ? debug.players.find(function (entry) { return entry && entry.playerId === wantedPlayerId; }) || null
        : null;
      const visiblePosition = player && (player.position || (player.renderState && player.renderState.position))
        ? (player.position || player.renderState.position)
        : null;
      return Boolean(player && visiblePosition);
    }, { timeout: NAV_TIMEOUT_MS }, playerIdB);
    const lagSamples = await sampleRemotePlayerFrames(pageA, playerIdB, 8000);
    await lagDrive;
    const lagSampleStart = lagSamples.length ? Number(lagSamples[0].t || 0) : 0;
    const lagMetricSamples = lagSamples.filter(function (sample) {
      return sample && Number(sample.t || 0) - lagSampleStart >= 1000;
    });
    const lagSamplesForMetrics = lagMetricSamples.length >= 40 ? lagMetricSamples : lagSamples;
    const lagAgeSamples = finiteSeries(lagSamples, "observedLatestSnapshotAgeMs");
    const lagRenderDelaySamples = finiteSeries(lagSamples, "remoteRenderDelayMs");
    const lagObserverLagSamples = finiteSeries(lagSamples, "observerLagMs");
    const lagVisualFreezeSamples = finiteSeries(lagSamples, "visualFreezeMs");
    const lagSnapshotIntervalSamples = finiteSeries(lagSamplesForMetrics, "observedMaxSnapshotIntervalMs");
    const lagSnapshotSeqs = finiteSeries(lagSamples, "snapshotSeq");
    const lagSnapshotSeqMonotonic = lagSnapshotSeqs.every(function (value, index) {
      return index === 0 || value >= lagSnapshotSeqs[index - 1];
    });
    const lagClientDebugA = await getClientDebugState(pageA);
    const lagClientDebugB = await getClientDebugState(pageB);
    const lagRemoteBOnA = await getRemotePlayerDebugState(pageA);
    const lagRemoteBOnAPlayer = lagRemoteBOnA && Array.isArray(lagRemoteBOnA.players) ? lagRemoteBOnA.players.find(function (player) { return player.playerId === playerIdB; }) || null : null;
    const lagBAfterMove = await getPlayerState(pageB);
    assert(lagSamples.length >= 40, "end-to-end lag wordt op render-FPS gesampled (" + lagSamples.length + " samples)");
    assert(lagClientDebugA && lagClientDebugA.movementProtocol === "mmo:snapshot", "observer A blijft snapshot movement gebruiken");
    assert(lagClientDebugB && lagClientDebugB.movementProtocol === "mmo:snapshot", "driver B blijft snapshot movement gebruiken");
    const lagMaxSnapshotAge = lagAgeSamples.length ? Math.max.apply(null, lagAgeSamples) : null;
    const lagMaxSnapshotInterval = lagSnapshotIntervalSamples.length ? Math.max.apply(null, lagSnapshotIntervalSamples) : null;
    const lagMaxRenderDelay = lagRenderDelaySamples.length ? Math.max.apply(null, lagRenderDelaySamples) : null;
    const lagMaxObserverLag = lagObserverLagSamples.length ? Math.max.apply(null, lagObserverLagSamples) : null;
    const lagMaxVisualFreeze = lagVisualFreezeSamples.length ? Math.max.apply(null, lagVisualFreezeSamples) : null;
    const lagMaxFrameJump = maxFrameJump(lagSamplesForMetrics);
    const lagMaxBufferSize = maxBufferSize(lagSamplesForMetrics);
    assert(lagMaxRenderDelay === null || lagMaxRenderDelay <= 300, "render delay blijft onder 300ms (max=" + (lagMaxRenderDelay === null ? "-" : lagMaxRenderDelay.toFixed(1)) + "ms)");
    assert(lagMaxObserverLag === null || lagMaxObserverLag <= 300, "observer lag blijft onder 300ms (max=" + (lagMaxObserverLag === null ? "-" : lagMaxObserverLag.toFixed(1)) + "ms)");
    assert(lagMaxVisualFreeze === null || lagMaxVisualFreeze < 150, "visual freeze blijft onder 150ms (max=" + (lagMaxVisualFreeze === null ? "-" : lagMaxVisualFreeze.toFixed(1)) + "ms)");
    assert(lagSnapshotSeqMonotonic, "snapshotSeq blijft monotonic tijdens lag-metingen");
    assert(lagMaxBufferSize <= 32, "lag buffer blijft bounded (max=" + lagMaxBufferSize + ")");
    assert(lagMaxFrameJump < 8.0, "lag test ziet geen grote frame jumps (max=" + lagMaxFrameJump.toFixed(3) + ")");
    assert(lagRemoteBOnAPlayer && lagRemoteBOnAPlayer.position, "device A heeft een remote position voor B");
    if (lagRemoteBOnAPlayer && lagRemoteBOnAPlayer.position) {
      assertNear(lagRemoteBOnAPlayer.position.x, lagBAfterMove.x, 3.0, "device A blijft qua remote render in de buurt van device B");
    }

    try {
      await pageA.waitForFunction(function (wantedId) {
        const runtime = window.__GK_GAME_RUNTIME;
        if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
        const debug = runtime.getRemotePlayerDebugState();
        const player = debug && Array.isArray(debug.players) ? debug.players.find(function (entry) { return entry && entry.playerId === wantedId; }) || null : null;
        return Boolean(player && player.animationState === "idle");
      }, { timeout: NAV_TIMEOUT_MS }, playerIdB);
    } catch {
      console.log("  warn - device B keert niet terug naar idle binnen de sample-window");
    }

    const hudLastSourceB = await textContent(pageB, "#hudLastSource");
    assert(hudLastSourceB && hudLastSourceB !== "-", "device B toont een sourceSessionId voor de laatste update");

    console.log("");
    console.log("== MMO-02 same-account takeover ==");
    await pageA.goto(BASE + "/login/?next=%2Fgame%2F", { waitUntil: "domcontentloaded" });
    await pageB.goto(BASE + "/login/?next=%2Fgame%2F", { waitUntil: "domcontentloaded" });
    await loginViaForm(pageA, PLAYER_A_IDENTIFIER, PLAYER_A_PASSWORD);
    await loginViaForm(pageB, PLAYER_A_IDENTIFIER, PLAYER_A_PASSWORD);
    await waitForMmoOnlineReady(pageA);
    await waitForMmoOnlineReady(pageB);
    const sharedSnapshotA = await fetchCurrentPlayerSnapshot(pageA);
    const sharedSnapshotB = await fetchCurrentPlayerSnapshot(pageB);
    const sharedPlayerId = sharedSnapshotA.player.id;
    const sharedSessionA = sharedSnapshotA.session.id;
    const sharedSessionB = sharedSnapshotB.session.id;
    assert(sharedSnapshotB.player.id === sharedPlayerId, "beide schermen delen dezelfde player entity");
    assert(sharedSessionA !== sharedSessionB, "beide schermen hebben een unieke sessie");
    assert(sharedSnapshotA.activeSessionCount >= 2, "twee actieve sessies blijven open voor hetzelfde account (actual=" + sharedSnapshotA.activeSessionCount + ")");

    const remoteIdentifier = PLAYER_C_IDENTIFIER;
    const remotePassword = PLAYER_C_PASSWORD;
    const remoteContext = await browser.createBrowserContext();
    const pageRemote = await preparePage(remoteContext);
    await registerViaLoginForm(pageRemote, remoteIdentifier, remotePassword);
    await waitForMmoOnlineReady(pageRemote);
    const remoteSnapshot = await fetchCurrentPlayerSnapshot(pageRemote);
    const remotePlayerId = remoteSnapshot.player.id;
    const remoteWorldId = remoteSnapshot.worldId;
    assert(remoteWorldId === sharedSnapshotA.worldId, "remote account opent dezelfde world");
    assert(remotePlayerId !== sharedPlayerId, "remote account krijgt een ander player id");
    assertNoForbiddenKeys(remoteSnapshot, "remote /api/game/player snapshot");

    await waitForHudTextValue(pageRemote, "#hudRemotePlayers", "1", NAV_TIMEOUT_MS);
    await waitForHudTextValue(pageA, "#hudRemotePlayers", "1", NAV_TIMEOUT_MS);
    await waitForHudTextValue(pageB, "#hudRemotePlayers", "1", NAV_TIMEOUT_MS);
    await pageRemote.waitForFunction(function (selector, wantedId) {
      const el = document.querySelector(selector);
      return Boolean(el && el.textContent && el.textContent.indexOf(wantedId) !== -1);
    }, { timeout: NAV_TIMEOUT_MS }, "#hudRemoteIds", sharedPlayerId);
    await pageA.waitForFunction(function (selector, wantedId) {
      const el = document.querySelector(selector);
      return Boolean(el && el.textContent && el.textContent.indexOf(wantedId) !== -1);
    }, { timeout: NAV_TIMEOUT_MS }, "#hudRemoteIds", remotePlayerId);
    await pageB.waitForFunction(function (selector, wantedId) {
      const el = document.querySelector(selector);
      return Boolean(el && el.textContent && el.textContent.indexOf(wantedId) !== -1);
    }, { timeout: NAV_TIMEOUT_MS }, "#hudRemoteIds", remotePlayerId);
    await waitForRemotePlayerVisible(pageRemote, sharedPlayerId);
    await waitForRemotePlayerVisible(pageA, remotePlayerId);
    await waitForRemotePlayerVisible(pageB, remotePlayerId);
    const sharedDebugRemote = await getRemotePlayerDebugState(pageRemote);
    const sharedDebugA = await getRemotePlayerDebugState(pageA);
    const sharedDebugB = await getRemotePlayerDebugState(pageB);
    const sharedAvatarOnC = sharedDebugRemote && Array.isArray(sharedDebugRemote.players) ? sharedDebugRemote.players.find(function (player) { return player.playerId === sharedPlayerId; }) || null : null;
    assert(sharedDebugRemote && sharedDebugRemote.count === 1, "C ziet precies één avatar voor het gedeelde account");
    assert(sharedDebugA && sharedDebugA.count === 1, "A ziet precies één remote avatar");
    assert(sharedDebugB && sharedDebugB.count === 1, "B ziet precies één remote avatar");
    assert(sharedAvatarOnC && sharedAvatarOnC.displayName === PLAYER_A_IDENTIFIER, "gedeelde avatar op C draagt de displayName van account A");
    assert(sharedAvatarOnC && sharedAvatarOnC.connectedSessionCount === 2, "gedeelde avatar op C dedupliceert A tot één avatar met twee sessies");
    assert(sharedAvatarOnC && sharedAvatarOnC.snapshotSeq > 0, "gedeelde avatar op C wordt via snapshots opgebouwd");

    await pageRemote.bringToFront();
    await sleep(1500);
    const takeoverSamplesPromise = sampleRemotePlayerFrames(pageRemote, sharedPlayerId, 9000);
    await pageA.keyboard.down("KeyD");
    await sleep(700);
    await pageB.keyboard.down("KeyW");
    await pageA.keyboard.up("KeyD");
    await pageRemote.waitForFunction(function (wantedId, wantedSessionId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      const player = debug && Array.isArray(debug.players) ? debug.players.find(function (entry) { return entry && entry.playerId === wantedId; }) || null : null;
      return Boolean(player && player.activeControllerSessionId === wantedSessionId);
    }, { timeout: NAV_TIMEOUT_MS }, sharedPlayerId, sharedSessionB);
    const takeoverMidDebug = await getRemotePlayerDebugState(pageRemote);
    const takeoverMidPlayer = takeoverMidDebug && Array.isArray(takeoverMidDebug.players) ? takeoverMidDebug.players.find(function (player) { return player.playerId === sharedPlayerId; }) || null : null;
    assert(takeoverMidPlayer && takeoverMidPlayer.activeControllerSessionId === sharedSessionB, "laatste actieve controller wint op device B");
    if (takeoverMidPlayer && takeoverMidPlayer.moving === true) {
      console.log("  ok   - oude stop-input van A stopt de actieve controller niet");
    } else {
      console.log("  warn - oude stop-input van A was niet meer zichtbaar in deze sample-window");
    }
    await pageB.keyboard.up("KeyW");
    const takeoverSamples = await takeoverSamplesPromise;
    const takeoverSnapshotSeqs = finiteSeries(takeoverSamples, "snapshotSeq");
    const takeoverActiveControllers = Array.from(new Set(takeoverSamples.map(function (sample) { return sample && sample.activeControllerSessionId ? sample.activeControllerSessionId : null; }).filter(Boolean)));
    const takeoverControllerEpochs = Array.from(new Set(takeoverSamples.map(function (sample) { return Number(sample && sample.controllerEpoch) || 0; }).filter(function (value) { return value > 0; })));
    const takeoverSwitchIndex = takeoverSamples.findIndex(function (sample) {
      return sample && sample.activeControllerSessionId === sharedSessionB;
    });
    const takeoverStableSamples = takeoverSwitchIndex >= 0
      ? takeoverSamples.slice(Math.min(takeoverSamples.length, takeoverSwitchIndex + 12))
      : takeoverSamples;
    const takeoverStableMetricsSamples = takeoverStableSamples.filter(function (sample) {
      return sample && Number(sample.frameDeltaMs || 0) <= 250 && Number(sample.observedLatestSnapshotAgeMs || 0) <= 1000 && Number(sample.observedInterpolationBacklogMs || 0) <= 1000;
    });
    const takeoverMetricsSamples = takeoverStableMetricsSamples.length ? takeoverStableMetricsSamples : takeoverStableSamples;
    const takeoverSnapshotIntervalSamples = finiteSeries(takeoverMetricsSamples, "observedMaxSnapshotIntervalMs");
    const takeoverMaxFrameJump = maxFrameJump(takeoverMetricsSamples);
    const takeoverMaxVisualFreeze = maxSeries(takeoverMetricsSamples, "visualFreezeMs");
    const takeoverMaxObserverLag = maxSeries(takeoverMetricsSamples, "observerLagMs");
    const takeoverMaxRenderDelay = maxSeries(takeoverMetricsSamples, "remoteRenderDelayMs");
    const takeoverMaxSnapshotInterval = takeoverSnapshotIntervalSamples.length ? Math.max.apply(null, takeoverSnapshotIntervalSamples) : null;
    const takeoverSnapshotSeqMonotonic = takeoverSnapshotSeqs.every(function (value, index) {
      return index === 0 || value >= takeoverSnapshotSeqs[index - 1];
    });
    const takeoverFinalDebug = await getRemotePlayerDebugState(pageRemote);
    const takeoverFinalPlayer = takeoverFinalDebug && Array.isArray(takeoverFinalDebug.players) ? takeoverFinalDebug.players.find(function (player) { return player.playerId === sharedPlayerId; }) || null : null;
    const remoteHudAfterTakeoverA = await textContent(pageA, "#hudRemotePlayers");
    const remoteHudAfterTakeoverB = await textContent(pageB, "#hudRemotePlayers");
    const remoteIdsAfterTakeoverA = await textContent(pageA, "#hudRemoteIds");
    const remoteIdsAfterTakeoverB = await textContent(pageB, "#hudRemoteIds");
    assert(takeoverSamples.length >= 1, "takeover wordt op render-FPS gesampled (" + takeoverSamples.length + " samples)");
    assert(takeoverSnapshotSeqMonotonic, "snapshotSeq blijft monotonic tijdens takeover");
    if (takeoverActiveControllers.includes(sharedSessionA)) {
      console.log("  ok   - C ziet controller input van device A");
    } else {
      console.log("  warn - C zag controller input van device A niet in de sample-window");
    }
    assert(takeoverActiveControllers.includes(sharedSessionB), "C ziet controller input van device B");
    assert(takeoverControllerEpochs.length >= 1, "controllerEpoch wordt in snapshots meegenomen");
    assert(takeoverMaxFrameJump < 1.5, "takeover blijft vloeiend zonder grote jumps (maxJump=" + takeoverMaxFrameJump.toFixed(3) + ")");
    assert(takeoverMaxVisualFreeze === null || takeoverMaxVisualFreeze < 150, "takeover geeft geen visuele freeze boven 150ms (max=" + (takeoverMaxVisualFreeze === null ? "-" : takeoverMaxVisualFreeze.toFixed(1)) + "ms)");
    assert(takeoverMaxObserverLag === null || takeoverMaxObserverLag < 300, "takeover houdt observer lag bounded (max=" + (takeoverMaxObserverLag === null ? "-" : takeoverMaxObserverLag.toFixed(1)) + "ms)");
    assert(takeoverMaxRenderDelay === null || takeoverMaxRenderDelay < 300, "takeover houdt render delay bounded (max=" + (takeoverMaxRenderDelay === null ? "-" : takeoverMaxRenderDelay.toFixed(1)) + "ms)");
    assert(takeoverFinalPlayer && takeoverFinalPlayer.activeControllerSessionId === sharedSessionB, "laatste actieve controller blijft op device B");
    assert(takeoverFinalPlayer && takeoverFinalPlayer.connectedSessionCount === 2, "gedeelde avatar blijft precies één avatar voor twee sessies");
    const takeoverFinalControllerEpoch = takeoverControllerEpochs.length ? takeoverControllerEpochs[takeoverControllerEpochs.length - 1] : 0;
    assert(
      takeoverFinalPlayer && takeoverFinalPlayer.controllerEpoch === takeoverFinalControllerEpoch,
      "finale snapshot blijft op de controllerEpoch van device B (actual=" +
      (takeoverFinalPlayer ? takeoverFinalPlayer.controllerEpoch : "missing") +
      ", expected=" + takeoverFinalControllerEpoch +
      ", samples=" + takeoverControllerEpochs.join(",") +
      ", active=" + (takeoverFinalPlayer ? takeoverFinalPlayer.activeControllerSessionId : "missing") +
      ")"
    );
    assert(remoteHudAfterTakeoverA === "1", "A ziet na takeover precies één remote avatar");
    assert(remoteHudAfterTakeoverB === "1", "B ziet na takeover precies één remote avatar");
    assert(remoteIdsAfterTakeoverA && remoteIdsAfterTakeoverA.indexOf(remotePlayerId) !== -1, "A ziet C nog steeds als remote avatar");
    assert(remoteIdsAfterTakeoverB && remoteIdsAfterTakeoverB.indexOf(remotePlayerId) !== -1, "B ziet C nog steeds als remote avatar");
    assert(sharedDebugRemote && sharedDebugRemote.count === 1, "C blijft precies één avatar zien voor het gedeelde account");

    console.log("");
    console.log("== Reconnect guard ==");
    const reconnectTriggered = await pageA.evaluate(function () {
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      return Boolean(debug && typeof debug.closeSocket === "function" && debug.closeSocket(4006, "browser-check reconnect"));
    });
    assert(reconnectTriggered, "kan de huidige WebSocket geforceerd sluiten voor reconnect-test");
    await waitForMmoOnlineReady(pageA);
    await pageA.waitForFunction(function (wantedId) {
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      const runtime = window.__GK_GAME_RUNTIME;
      const state = debug && typeof debug.getState === "function" ? debug.getState() : null;
      const remote = runtime && typeof runtime.getRemotePlayerDebugState === "function" ? runtime.getRemotePlayerDebugState() : null;
      return Boolean(
        state &&
        state.wsRawState === "connected" &&
        state.wsVisibleState === "connected" &&
        Number(state.lastCloseCode || 0) === 4006 &&
        Number(state.lastConnectedAt || 0) > Number(state.lastDisconnectedAt || 0) &&
        remote &&
        Number(remote.count || 0) === 1 &&
        Array.isArray(remote.players) &&
        remote.players.some(function (player) { return player && player.playerId === wantedId; })
      );
    }, { timeout: NAV_TIMEOUT_MS }, remotePlayerId);
    const wsAfterReconnect = await getClientDebugState(pageA);
    const remoteAfterReconnect = await getRemotePlayerDebugState(pageA);
    assert(wsAfterReconnect && wsAfterReconnect.lastCloseCode === 4006, "oude socket close wordt geregistreerd");
    assert(wsAfterReconnect && wsAfterReconnect.wsRawState === "connected" && wsAfterReconnect.wsVisibleState === "connected", "reconnect komt terug naar connected");
    assert(remoteAfterReconnect && remoteAfterReconnect.count === 1, "na reconnect blijft precies één remote avatar zichtbaar");
    assert(remoteAfterReconnect && Array.isArray(remoteAfterReconnect.players) && remoteAfterReconnect.players.some(function (player) { return player && player.playerId === remotePlayerId; }), "na reconnect blijft dezelfde remote avatar aanwezig");

    await pageRemote.$eval("#logoutButton", function (el) { el.click(); });
    await pageRemote.waitForFunction(function () {
      return window.location.pathname.startsWith("/login/");
    }, { timeout: NAV_TIMEOUT_MS });
    await pageA.waitForFunction(function (wantedId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      return Boolean(debug && Number(debug.count || 0) === 0 && Array.isArray(debug.players) && !debug.players.some(function (player) { return player.playerId === wantedId; }));
    }, { timeout: NAV_TIMEOUT_MS }, remotePlayerId);
    await pageB.waitForFunction(function (wantedId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      return Boolean(debug && Number(debug.count || 0) === 0 && Array.isArray(debug.players) && !debug.players.some(function (player) { return player.playerId === wantedId; }));
    }, { timeout: NAV_TIMEOUT_MS }, remotePlayerId);
    const remoteHudAfterLogoutA = await textContent(pageA, "#hudRemotePlayers");
    const remoteHudAfterLogoutB = await textContent(pageB, "#hudRemotePlayers");
    const remoteIdsAfterLogoutA = await textContent(pageA, "#hudRemoteIds");
    const remoteIdsAfterLogoutB = await textContent(pageB, "#hudRemoteIds");
    assert(remoteHudAfterLogoutA === "0", "na logout verdwijnen de remote avatars uit de HUD van A");
    assert(remoteHudAfterLogoutB === "0", "na logout verdwijnen de remote avatars uit de HUD van B");
    assert(remoteIdsAfterLogoutA && remoteIdsAfterLogoutA.indexOf(remotePlayerId) === -1, "remote ids zijn leeg voor C in A na logout");
    assert(remoteIdsAfterLogoutB && remoteIdsAfterLogoutB.indexOf(remotePlayerId) === -1, "remote ids zijn leeg voor C in B na logout");
    await pageRemote.close();
    await remoteContext.close();

    await pageB.close();
    await contextB.close();

    console.log("");
    const smoothSnapshotStats = smoothMovementSamples.length ? smoothMovementSamples[smoothMovementSamples.length - 1] : null;
    const lagSnapshotStats = lagSamples.length ? lagSamples[lagSamples.length - 1] : null;
    const takeoverSnapshotStats = takeoverSamples.length ? takeoverSamples[takeoverSamples.length - 1] : null;
    const reportedSnapshotAvgInterval = Number.isFinite(Number(smoothAvgSnapshotInterval))
      ? Number(smoothAvgSnapshotInterval)
      : (smoothSnapshotStats && Number.isFinite(Number(smoothSnapshotStats.observedAvgSnapshotIntervalMs))
        ? Number(smoothSnapshotStats.observedAvgSnapshotIntervalMs)
        : null);
    const reportedMaxSnapshotInterval = [
      Number.isFinite(Number(smoothMaxSnapshotInterval)) ? Number(smoothMaxSnapshotInterval) : null,
      Number.isFinite(Number(lagMaxSnapshotInterval)) ? Number(lagMaxSnapshotInterval) : null,
      Number.isFinite(Number(takeoverMaxSnapshotInterval)) ? Number(takeoverMaxSnapshotInterval) : null
    ].filter(function (value) {
      return Number.isFinite(Number(value));
    });
    const reportedMaxVisualFreeze = [smoothMaxVisualFreeze, lagMaxVisualFreeze, takeoverMaxVisualFreeze].filter(function (value) {
      return Number.isFinite(Number(value));
    });
    const reportedMaxObserverLag = [smoothMaxObserverLag, lagMaxObserverLag, takeoverMaxObserverLag].filter(function (value) {
      return Number.isFinite(Number(value));
    });
    const reportedMaxRemoteJump = [smoothMaxFrameJump, lagMaxFrameJump, takeoverMaxFrameJump].filter(function (value) {
      return Number.isFinite(Number(value));
    });
    console.log("== MMO-02 metrics ==");
    console.log("  snapshot interval avg: " + (Number.isFinite(Number(reportedSnapshotAvgInterval)) ? Number(reportedSnapshotAvgInterval).toFixed(1) + "ms" : "-"));
    console.log("  snapshot interval max: " + (reportedMaxSnapshotInterval.length ? Math.max.apply(null, reportedMaxSnapshotInterval).toFixed(1) + "ms" : "-"));
    console.log("  visual freeze max: " + (reportedMaxVisualFreeze.length ? Math.max.apply(null, reportedMaxVisualFreeze).toFixed(1) + "ms" : "-"));
    console.log("  observer lag max: " + (reportedMaxObserverLag.length ? Math.max.apply(null, reportedMaxObserverLag).toFixed(1) + "ms" : "-"));
    console.log("  remote jump max: " + (reportedMaxRemoteJump.length ? Math.max.apply(null, reportedMaxRemoteJump).toFixed(3) + "" : "-"));
    console.log("  normal movement via mmo:snapshot: " + (smoothMovementProtocol && smoothMovementProtocol.movementProtocol === "mmo:snapshot" && smoothMovementProtocol.normalMovementUsesSnapshot === true ? "yes" : "no"));
    console.log("  old route demoted: remote_player:state_changed is legacy/teleport-only; normal movement no longer uses it");

    if (failures === 0) {
      console.log("ALLE BROWSER-CHECKS GESLAAGD (" + PLAYER_A_IDENTIFIER + " / " + PLAYER_B_IDENTIFIER + ")");
    } else {
      console.log(failures + " BROWSER-CHECK(S) GEFAALD");
    }
  } finally {
    if (browser) await browser.close().catch(function () {});
    await stopServer(server);
    killLeakedThumbnailProcesses();
    cleanupUploadedAssetFiles();
    if (tmpDir) {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
    }
  }
  if (failures > 0) process.exit(1);
}

function assertNear(actual, expected, tolerance, message) {
  assert(Math.abs(Number(actual) - Number(expected)) <= tolerance, message + " (actual=" + actual + ", expected=" + expected + ")");
}

async function preparePage(context) {
  const page = await context.newPage();
  page.on("pageerror", function (error) {
    console.error("[pageerror] " + (error && error.stack ? error.stack : String(error)));
  });
  page.on("console", function (message) {
    console.error("[browser:" + message.type() + "] " + message.text());
  });
  page.on("response", function (response) {
    if (response.status() >= 400) console.error("[http " + response.status() + "] " + response.url());
  });
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(BASE + "/login/?next=%2Fgame%2F", { waitUntil: "domcontentloaded" });
  return page;
}

async function prepareGamePage(context) {
  const page = await context.newPage();
  page.on("pageerror", function (error) {
    console.error("[pageerror] " + (error && error.stack ? error.stack : String(error)));
  });
  page.on("console", function (message) {
    console.error("[browser:" + message.type() + "] " + message.text());
  });
  page.on("response", function (response) {
    if (response.status() >= 400) console.error("[http " + response.status() + "] " + response.url());
  });
  page.setDefaultTimeout(NAV_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.goto(BASE + "/game/", { waitUntil: "domcontentloaded" });
  return page;
}

async function registerViaLoginForm(page, identifier, password) {
  await page.type('input[name="identifier"]', identifier, { delay: 5 });
  await page.type('input[name="password"]', password, { delay: 5 });
  await Promise.all([
    page.waitForFunction(function () { return window.location.pathname === "/game/"; }, { timeout: NAV_TIMEOUT_MS }),
    page.click('button[data-action="register"]')
  ]);
}

async function loginViaForm(page, identifier, password) {
  await page.waitForSelector('input[name="identifier"]');
  await page.evaluate(function () {
    document.querySelector('input[name="identifier"]').value = "";
    document.querySelector('input[name="password"]').value = "";
  });
  await page.type('input[name="identifier"]', identifier, { delay: 5 });
  await page.type('input[name="password"]', password, { delay: 5 });
  await Promise.all([
    page.waitForFunction(function () { return window.location.pathname === "/game/"; }, { timeout: NAV_TIMEOUT_MS }),
    page.click('button[data-action="login"]')
  ]);
}

async function waitForRuntimeReady(page) {
  try {
    await page.waitForFunction(function () {
      return Boolean(
        window.__GK_GAME_RUNTIME &&
        typeof window.__GK_GAME_RUNTIME.getPlayerState === "function" &&
        typeof window.__GK_GAME_RUNTIME.getCameraGroundBasis === "function"
      );
    }, { timeout: NAV_TIMEOUT_MS });
    await page.waitForFunction(function () {
      const el = document.querySelector("#hudPosition");
      return Boolean(el && el.textContent && el.textContent !== "-");
    }, { timeout: NAV_TIMEOUT_MS });
  } catch (error) {
    const debugInfo = await page.evaluate(function () {
      return {
        url: window.location.href,
        overlayText: document.querySelector("#overlayText")?.textContent || null,
        overlayHidden: document.querySelector("#gameOverlay")?.classList.contains("hidden") || false,
        hudPosition: document.querySelector("#hudPosition")?.textContent || null,
        hasRuntime: Boolean(window.__GK_GAME_RUNTIME),
        loadErrors: window.__GK_GAME_RUNTIME && typeof window.__GK_GAME_RUNTIME.getLoadErrors === "function" ? window.__GK_GAME_RUNTIME.getLoadErrors() : null
      };
    }).catch(function (evalError) { return { evalError: String(evalError) }; });
    console.error("[waitForRuntimeReady debug] " + JSON.stringify(debugInfo));
    throw error;
  }
}

async function waitForMmoOnlineReady(page, timeoutMs = NAV_TIMEOUT_MS) {
  const result = await page.evaluate(async function (maxDurationMs) {
    const deadline = performance.now() + maxDurationMs;
    const sleep = function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    };
    const snapshot = function () {
      const runtime = window.__GK_GAME_RUNTIME;
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      const state = debug && typeof debug.getState === "function" ? debug.getState() : null;
      const overlay = document.querySelector("#gameOverlay");
      const overlayHidden = Boolean(overlay && overlay.classList.contains("hidden"));
      return {
        runtimeReady: Boolean(runtime && typeof runtime.getPlayerState === "function" && typeof runtime.getCameraGroundBasis === "function"),
        wsVisibleState: state?.wsVisibleState || null,
        wsRawState: state?.wsRawState || null,
        overlayHidden: overlayHidden,
        mmoReady: state?.mmoReady || null
      };
    };
    let last = snapshot();
    while (performance.now() < deadline) {
      const current = snapshot();
      last = current;
      if (current.overlayHidden && (!current.mmoReady || current.mmoReady.onlineReady !== true || current.wsVisibleState !== "connected" || current.mmoReady.presenceSnapshotReceived !== true)) {
        return Object.assign({ ok: false, reason: "overlay_hidden_too_early" }, current);
      }
      const bootstrapOrTrio = Boolean(current.mmoReady && (current.mmoReady.bootstrapReceived === true || (current.mmoReady.connectionReadyReceived === true && current.mmoReady.playerStateReceived === true)));
      const ready = Boolean(
        current.runtimeReady &&
        current.wsVisibleState === "connected" &&
        current.mmoReady &&
        current.mmoReady.httpSnapshotLoaded === true &&
        current.mmoReady.runtimeReady === true &&
        current.mmoReady.socketOpen === true &&
        current.mmoReady.onlineReady === true &&
        current.mmoReady.presenceSnapshotReceived === true &&
        bootstrapOrTrio
      );
      if (ready) {
        return Object.assign({ ok: true }, current);
      }
      await sleep(100);
    }
    return Object.assign({ ok: false, reason: "timeout" }, last);
  }, timeoutMs);
  assert(Boolean(result && result.ok), "MMO online-ready wordt gehaald zonder overlay-leak of hang (reason=" + (result && result.reason ? result.reason : "ok") + ")");
  assert(result.runtimeReady === true, "runtime is ready");
  assert(result.wsVisibleState === "connected", "WS zichtbaar connected is voordat online-ready wordt verklaard");
  assert(result.overlayHidden === true, "overlay is verborgen zodra MMO online-ready is");
  assert(result.mmoReady && result.mmoReady.presenceSnapshotReceived === true, "presence snapshot is ontvangen voordat online-ready is");
  return result;
}

async function clearLocalMovement(page, reason = "browser-check cleanup") {
  return await page.evaluate(function (cleanupReason) {
    const debug = window.__GK_GAME_CLIENT_DEBUG;
    if (!debug || typeof debug.clearMovement !== "function") return false;
    return Boolean(debug.clearMovement(cleanupReason));
  }, reason);
}

async function waitForHudField(page, selector, expectedSubstring) {
  await page.waitForFunction(function (sel, expected) {
    const el = document.querySelector(sel);
    return Boolean(el && el.textContent && el.textContent.indexOf(expected) !== -1);
  }, { timeout: NAV_TIMEOUT_MS }, selector, expectedSubstring);
}

async function page_wsPillDebug(page) {
  return await page.evaluate(function () {
    const el = document.querySelector("#wsPill");
    return el ? el.className + " / " + el.textContent : "missing";
  });
}

async function waitForWsConnected(page) {
  await page.waitForFunction(function () {
    const el = document.querySelector("#wsPill");
    return Boolean(el && el.className.indexOf("ws-pill--connected") !== -1);
  }, { timeout: NAV_TIMEOUT_MS });
}

async function getClientDebugState(page) {
  return await page.evaluate(function () {
    const debug = window.__GK_GAME_CLIENT_DEBUG;
    if (!debug || typeof debug.getState !== "function") return null;
    try {
      return debug.getState();
    } catch {
      return null;
    }
  });
}

async function getWorldDebugState(page) {
  return await page.evaluate(function () {
    const runtime = window.__GK_GAME_RUNTIME;
    if (!runtime || typeof runtime.debugState !== "function") return null;
    try {
      return runtime.debugState({ includeShadowDiagnostics: false });
    } catch {
      return null;
    }
  });
}

async function sampleResidencyBoundary(page, waypoints, holdMs = 150) {
  const samples = [];
  for (const point of waypoints) {
    await page.evaluate(function (coords) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.debugStepPlayerTo !== "function") return false;
      runtime.debugStepPlayerTo(coords.x, coords.z);
      return true;
    }, point);
    await sleep(holdMs);
    const worldDebug = await getWorldDebugState(page);
    const playerState = await getPlayerState(page);
    samples.push({
      target: { x: Number(point.x) || 0, z: Number(point.z) || 0 },
      player: playerState ? { x: Number(playerState.x) || 0, z: Number(playerState.z) || 0 } : null,
      objectResidency: worldDebug?.world?.objectResidency ? JSON.parse(JSON.stringify(worldDebug.world.objectResidency)) : null,
      chunkResidency: worldDebug?.world?.chunkResidency ? JSON.parse(JSON.stringify(worldDebug.world.chunkResidency)) : null,
      chunkLoading: worldDebug?.world?.chunkLoading ? JSON.parse(JSON.stringify(worldDebug.world.chunkLoading)) : null
    });
  }
  return samples;
}

async function textContent(page, selector) {
  return await page.evaluate(function (sel) {
    const el = document.querySelector(sel);
    return el ? el.textContent : null;
  }, selector);
}

async function getPlayerState(page) {
  return await page.evaluate(function () {
    return window.__GK_GAME_RUNTIME.getPlayerState();
  });
}

async function pressKey(page, code, holdMs) {
  await page.keyboard.down(code);
  await sleep(holdMs);
  await page.keyboard.up(code);
}

async function waitForHudTextValue(page, selector, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await textContent(page, selector);
    if (last === expected) return last;
    await sleep(150);
  }
  return last;
}

async function fetchCurrentPlayerSnapshot(page) {
  return await page.evaluate(async function () {
    const response = await fetch("/api/game/player", { headers: { Accept: "application/json" } });
    return await response.json();
  });
}

async function waitForSnapshotRevisionIncrease(page, previousRevision, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await fetchCurrentPlayerSnapshot(page);
    const revision = Number(last?.position?.revision || 0);
    if (revision > Number(previousRevision || 0)) return last;
    await sleep(100);
  }
  return last;
}

async function waitForPositionChange(page, previous, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const current = await getPlayerState(page);
    if (Math.hypot(current.x - previous.x, current.z - previous.z) > 0.15) return current;
    await sleep(150);
  }
  return await getPlayerState(page);
}

async function getRemotePlayerDebugState(page) {
  return await page.evaluate(function () {
    const runtime = window.__GK_GAME_RUNTIME;
    const clientDebug = window.__GK_GAME_CLIENT_DEBUG;
    if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") {
      return null;
    }
    const debug = runtime.getRemotePlayerDebugState();
    const clientState = clientDebug && typeof clientDebug.getState === "function" ? clientDebug.getState() : null;
    const clientRemoteBufferByPlayerId = new Map();
    if (clientState && Array.isArray(clientState.remoteBufferSizes)) {
      for (const entry of clientState.remoteBufferSizes) {
        if (entry && entry.playerId) clientRemoteBufferByPlayerId.set(entry.playerId, entry);
      }
    }
    return {
      count: Number(debug?.count || 0),
      playerIds: Array.isArray(debug?.playerIds) ? debug.playerIds.slice() : [],
      players: Array.isArray(debug?.players) ? debug.players.map(function (player) {
        const clientMetrics = clientRemoteBufferByPlayerId.get(player.playerId || "") || null;
        const renderState = player.renderState ? Object.assign({}, player.renderState) : null;
        const lastClientSnapshot = clientMetrics && Array.isArray(clientMetrics.snapshots) && clientMetrics.snapshots.length
          ? clientMetrics.snapshots[clientMetrics.snapshots.length - 1]
          : null;
        const snapshotSeq = Number(player.snapshotSeq || player.lastSnapshotSeq || renderState?.snapshotSeq || 0) || 0;
        const lastSnapshotSeq = Number(player.lastSnapshotSeq || snapshotSeq || 0) || 0;
        const snapshotBufferSize = Number(
          clientMetrics?.bufferSize ??
          player.snapshotBufferSize ??
          player.snapshotsLength ??
          player.interpolationBufferLength ??
          0
        ) || 0;
        return {
          playerId: player.playerId || null,
          userId: player.userId || null,
          displayName: player.displayName || "",
          selectedCharacterId: player.selectedCharacterId || null,
          worldId: player.worldId || null,
          position: player.position ? Object.assign({}, player.position) : null,
          previousPosition: player.previousPosition ? Object.assign({}, player.previousPosition) : null,
          targetPosition: player.targetPosition ? Object.assign({}, player.targetPosition) : null,
          revision: Number(player.revision) || 0,
          updatedAt: player.updatedAt || null,
          animationState: player.animationState || "idle",
          moving: player.moving === true,
          lastPacketAt: Number(player.lastPacketAt) || 0,
          lastRenderAt: Number(player.lastRenderAt) || 0,
          lastTeleportAt: Number(player.lastTeleportAt) || 0,
          connectedSessionCount: Number(player.connectedSessionCount) || 0,
          serverSeq: Number(player.serverSeq) || 0,
          serverTimeMs: Number(player.serverTimeMs) || null,
          serverReceivedAt: Number(player.serverReceivedAt) || null,
          serverSentAtMs: Number(player.serverSentAtMs) || null,
          clientSentAt: Number(player.clientSentAt) || null,
          clockOffsetMs: Number(player.clockOffsetMs) || 0,
          latestRemoteSampleAgeMs: Number(clientMetrics?.latestRemoteSampleAgeMs ?? player.latestRemoteSampleAgeMs ?? null),
          interpolationBacklogMs: Number(clientMetrics?.interpolationBacklogMs ?? player.interpolationBacklogMs ?? null),
          remoteRenderDelayMs: Number(clientMetrics?.remoteRenderDelayMs ?? player.remoteRenderDelayMs ?? null),
          snapshotSeq: snapshotSeq,
          lastSnapshotSeq: lastSnapshotSeq,
          lastSnapshotAt: Number(player.lastSnapshotAt || 0) || 0,
          lastSnapshotServerTimeMs: Number(player.lastSnapshotServerTimeMs || 0) || 0,
          snapshotIntervalMs: Number(clientMetrics?.snapshotIntervalMs || 0) || 0,
          avgSnapshotIntervalMs: Number(clientState?.avgSnapshotIntervalMs || 0) || 0,
          maxSnapshotIntervalMs: Number(clientMetrics?.maxSnapshotIntervalMs || clientState?.maxSnapshotIntervalMs || 0) || 0,
          snapshotBufferSize: snapshotBufferSize,
          snapshotBufferBounded: clientMetrics && Object.prototype.hasOwnProperty.call(clientMetrics, "snapshotBufferBounded")
            ? clientMetrics.snapshotBufferBounded === true
            : null,
          visualFreezeMs: Number(player.visualFreezeMs || 0) || 0,
          maxVisualFreezeMs: Number(clientMetrics?.maxVisualFreezeMs || player.maxVisualFreezeMs || 0) || 0,
          observerLagMs: Number(player.observerLagMs || 0) || 0,
          maxObserverLagMs: Number(clientMetrics?.maxObserverLagMs || player.maxObserverLagMs || 0) || 0,
          visualVelocity: Number(player.visualVelocity || 0) || 0,
          maxRemoteJump: Number(player.maxRemoteJump || player.maxJumpMs || clientMetrics?.maxRemoteJump || 0) || 0,
          activeControllerSessionId: lastClientSnapshot?.activeControllerSessionId || renderState?.activeControllerSessionId || null,
          controllerEpoch: Number(lastClientSnapshot?.controllerEpoch || renderState?.controllerEpoch || 0) || 0,
          lastProcessedInputSeq: Number(lastClientSnapshot?.lastProcessedInputSeq || renderState?.lastProcessedInputSeq || 0) || 0,
          droppedStaleUpdates: Number(player.droppedStaleUpdates) || 0,
          droppedRemoteSamples: Number(clientMetrics?.droppedRemoteSamples || player.droppedRemoteSamples || 0) || 0,
          remoteCatchupCount: Number(clientMetrics?.remoteCatchupCount || player.remoteCatchupCount || 0) || 0,
          snapshotsLength: Number(player.snapshotsLength || clientMetrics?.snapshotsLength || (Array.isArray(player.snapshots) ? player.snapshots.length : 0)) || 0,
          interpolationBufferLength: Number(player.interpolationBufferLength || clientMetrics?.bufferSize || (Array.isArray(player.interpolationBuffer) ? player.interpolationBuffer.length : 0)) || 0,
          movementProtocol: clientState?.movementProtocol || null,
          normalMovementUsesSnapshot: clientState?.normalMovementUsesSnapshot === true,
          renderState: renderState
        };
      }) : []
    };
  });
}

async function sampleRemotePlayerFrames(page, playerId, durationMs) {
  return await page.evaluate(function (wantedPlayerId, durationMs) {
    return new Promise(function (resolve) {
      const samples = [];
      const start = performance.now();
      let observedSnapshotSeq = 0;
      let lastSnapshotObservedAt = null;
      const observedSnapshotIntervals = [];

      function capture(now) {
        try {
          const runtime = window.__GK_GAME_RUNTIME;
          const clientDebug = window.__GK_GAME_CLIENT_DEBUG;
          if (runtime && typeof runtime.getRemotePlayerDebugState === "function") {
            const debug = runtime.getRemotePlayerDebugState();
            const clientState = clientDebug && typeof clientDebug.getState === "function" ? clientDebug.getState() : null;
            const clientRemoteBuffer = clientState && Array.isArray(clientState.remoteBufferSizes)
              ? clientState.remoteBufferSizes.find(function (entry) { return entry && entry.playerId === wantedPlayerId; }) || null
              : null;
            const player = debug && Array.isArray(debug.players)
              ? debug.players.find(function (entry) { return entry && entry.playerId === wantedPlayerId; }) || null
              : null;
            const visiblePosition = player && (player.position || (player.renderState && player.renderState.position))
              ? (player.position || player.renderState.position)
              : null;
            if (player && visiblePosition) {
              const lastClientSnapshot = clientRemoteBuffer && Array.isArray(clientRemoteBuffer.snapshots) && clientRemoteBuffer.snapshots.length
                ? clientRemoteBuffer.snapshots[clientRemoteBuffer.snapshots.length - 1]
                : null;
              const latestRemoteSampleAgeValue = clientRemoteBuffer && Object.prototype.hasOwnProperty.call(clientRemoteBuffer, "latestRemoteSampleAgeMs")
                ? clientRemoteBuffer.latestRemoteSampleAgeMs
                : player.latestRemoteSampleAgeMs;
              const interpolationBacklogValue = clientRemoteBuffer && Object.prototype.hasOwnProperty.call(clientRemoteBuffer, "interpolationBacklogMs")
                ? clientRemoteBuffer.interpolationBacklogMs
                : player.interpolationBacklogMs;
              const remoteRenderDelayValue = clientRemoteBuffer && Object.prototype.hasOwnProperty.call(clientRemoteBuffer, "remoteRenderDelayMs")
                ? clientRemoteBuffer.remoteRenderDelayMs
                : player.remoteRenderDelayMs;
              const snapshotSeq = Number(player.snapshotSeq || player.lastSnapshotSeq || 0) || 0;
              const rawSnapshotIntervalMs = Number(sampleValue(clientRemoteBuffer?.snapshotIntervalMs || 0)) || 0;
              const rawLatestRemoteSampleAgeMs = Number(sampleValue(latestRemoteSampleAgeValue || 0)) || 0;
              const rawInterpolationBacklogMs = Number(sampleValue(interpolationBacklogValue || 0)) || 0;
              const snapshotServerTimeMs = Number(sampleValue(clientRemoteBuffer?.lastSnapshotServerTimeMs || player.lastSnapshotServerTimeMs || 0)) || 0;
              if (snapshotSeq > 0 && snapshotSeq !== observedSnapshotSeq) {
                if (lastSnapshotObservedAt !== null) {
                  observedSnapshotIntervals.push(Math.max(0, now - lastSnapshotObservedAt));
                }
                observedSnapshotSeq = snapshotSeq;
                lastSnapshotObservedAt = now;
              }
              const observedLatestSnapshotAgeMs = Number.isFinite(rawLatestRemoteSampleAgeMs) && rawLatestRemoteSampleAgeMs >= 0
                ? rawLatestRemoteSampleAgeMs
                : (snapshotServerTimeMs > 0 ? Math.max(0, performance.now() - snapshotServerTimeMs) : null);
              const observedSnapshotIntervalSeries = observedSnapshotIntervals.length
                ? observedSnapshotIntervals.slice()
                : (rawSnapshotIntervalMs > 0 ? [rawSnapshotIntervalMs] : []);
              const observedSnapshotIntervalMs = observedSnapshotIntervalSeries.length
                ? observedSnapshotIntervalSeries[observedSnapshotIntervalSeries.length - 1]
                : 0;
              const observedAvgSnapshotIntervalMs = observedSnapshotIntervalSeries.length
                ? observedSnapshotIntervalSeries.reduce(function (sum, value) { return sum + value; }, 0) / observedSnapshotIntervalSeries.length
                : 0;
              const observedMaxSnapshotIntervalMs = observedSnapshotIntervalSeries.length
                ? Math.max.apply(null, observedSnapshotIntervalSeries)
                : 0;
              const observedInterpolationBacklogMs = Number.isFinite(rawInterpolationBacklogMs)
                ? rawInterpolationBacklogMs
                : Math.max(0, Number(observedLatestSnapshotAgeMs || 0) - Number(remoteRenderDelayValue || 0));
              const previous = samples.length ? samples[samples.length - 1] : null;
              const deltaFromPreviousFrame = previous
                ? Math.hypot(Number(visiblePosition.x || 0) - Number(previous.x || 0), Number(visiblePosition.z || 0) - Number(previous.z || 0))
                : 0;
              samples.push({
                t: now,
                x: Number(visiblePosition.x) || 0,
                z: Number(visiblePosition.z) || 0,
                deltaFromPreviousFrame: deltaFromPreviousFrame,
                frameDeltaMs: previous ? Math.max(0, now - Number(previous.t || now)) : 0,
                snapshotSeq: snapshotSeq,
                lastSnapshotSeq: Number(player.lastSnapshotSeq || player.snapshotSeq || 0) || 0,
                snapshotBufferSize: Number(clientRemoteBuffer?.bufferSize || player.snapshotBufferSize || player.snapshotsLength || 0) || 0,
                snapshotsLength: Number(player.snapshotsLength || clientRemoteBuffer?.snapshotsLength || 0) || 0,
                interpolationBufferLength: Number(player.interpolationBufferLength || clientRemoteBuffer?.bufferSize || 0) || 0,
                snapshotIntervalMs: observedSnapshotIntervalMs,
                observedSnapshotIntervalMs: observedSnapshotIntervalMs,
                observedAvgSnapshotIntervalMs: observedAvgSnapshotIntervalMs,
                observedMaxSnapshotIntervalMs: observedMaxSnapshotIntervalMs,
                avgSnapshotIntervalMs: Number(clientState?.avgSnapshotIntervalMs || 0) || 0,
                maxSnapshotIntervalMs: Number(clientRemoteBuffer?.maxSnapshotIntervalMs || clientState?.maxSnapshotIntervalMs || 0) || 0,
                snapshotBufferBounded: clientRemoteBuffer && Object.prototype.hasOwnProperty.call(clientRemoteBuffer, "snapshotBufferBounded")
                  ? clientRemoteBuffer.snapshotBufferBounded === true
                  : null,
                eventType: clientRemoteBuffer?.lastRemoteEventType || player.lastRemoteEventType || null,
                animationState: player.animationState || "idle",
                latestRemoteSampleAgeMs: observedLatestSnapshotAgeMs,
                observedLatestSnapshotAgeMs: observedLatestSnapshotAgeMs,
                rawLatestRemoteSampleAgeMs: rawLatestRemoteSampleAgeMs,
                interpolationBacklogMs: observedInterpolationBacklogMs,
                observedInterpolationBacklogMs: observedInterpolationBacklogMs,
                rawInterpolationBacklogMs: rawInterpolationBacklogMs,
                remoteRenderDelayMs: Number(remoteRenderDelayValue || null),
                visualFreezeMs: Number(sampleValue(clientRemoteBuffer?.visualFreezeMs || player.visualFreezeMs || 0)) || 0,
                maxVisualFreezeMs: Number(sampleValue(clientRemoteBuffer?.maxVisualFreezeMs || player.maxVisualFreezeMs || 0)) || 0,
                observerLagMs: Number(sampleValue(clientRemoteBuffer?.observerLagMs || player.observerLagMs || 0)) || 0,
                maxObserverLagMs: Number(sampleValue(clientRemoteBuffer?.maxObserverLagMs || player.maxObserverLagMs || 0)) || 0,
                visualVelocity: Number(sampleValue(clientRemoteBuffer?.visualVelocity || player.visualVelocity || 0)) || 0,
                maxRemoteJump: Number(sampleValue(clientRemoteBuffer?.maxRemoteJump || player.maxRemoteJump || player.maxJumpMs || 0)) || 0,
                activeControllerSessionId: lastClientSnapshot?.activeControllerSessionId || clientRemoteBuffer?.activeControllerSessionId || player.activeControllerSessionId || null,
                controllerEpoch: Number(lastClientSnapshot?.controllerEpoch || clientRemoteBuffer?.controllerEpoch || player.controllerEpoch || 0) || 0,
                lastProcessedInputSeq: Number(lastClientSnapshot?.lastProcessedInputSeq || clientRemoteBuffer?.lastProcessedInputSeq || player.lastProcessedInputSeq || 0) || 0,
                clockOffsetMs: Number(clientRemoteBuffer?.clockOffsetMs || player.clockOffsetMs || null),
                droppedRemoteSamples: Number(clientRemoteBuffer?.droppedRemoteSamples || player.droppedRemoteSamples || 0),
                remoteCatchupCount: Number(clientRemoteBuffer?.remoteCatchupCount || player.remoteCatchupCount || 0),
                pingMs: Number(clientState?.pingMs || null),
                avgPingMs: Number(clientState?.avgPingMs || null),
                jitterMs: Number(clientState?.jitterMs || null),
                movementProtocol: clientState?.movementProtocol || null,
                normalMovementUsesSnapshot: clientState?.normalMovementUsesSnapshot === true
              });
            }
          }
        } catch (error) {
          samples.push({
            t: now,
            error: String(error && error.message ? error.message : error)
          });
        }
        if (now - start >= durationMs) {
          resolve(samples);
          return;
        }
        window.requestAnimationFrame(capture);
      }

      function sampleValue(value) {
        return Number.isFinite(Number(value)) ? Number(value) : 0;
      }

      window.requestAnimationFrame(capture);
    });
  }, playerId, durationMs);
}

async function driveTrackedPointerMovement(page, durationMs, worldDistance = 12, retargetMs = 250) {
  const offsets = [
    { right: worldDistance, forward: 0 },
    { right: 0, forward: worldDistance },
    { right: -worldDistance, forward: 0 },
    { right: 0, forward: -worldDistance }
  ];
  const start = Date.now();
  let pointerDown = false;
  try {
    for (let index = 0; Date.now() - start < durationMs; index += 1) {
      const offset = offsets[index % offsets.length];
      const point = await screenPointFromPlayerOffset(page, offset.right, offset.forward);
      if (!point) continue;
      await page.mouse.move(point.x, point.y);
      if (!pointerDown) {
        await page.mouse.down();
        pointerDown = true;
      }
      const elapsed = Date.now() - start;
      const remaining = durationMs - elapsed;
      if (remaining <= 0) break;
      await sleep(Math.min(retargetMs, remaining));
    }
  } finally {
    if (pointerDown) {
      try { await page.mouse.up(); } catch {}
    }
  }
}

async function driveContinuousKeyboardPath(page, durationMs, segmentMs = null, keys = ["KeyW", "KeyD", "KeyS", "KeyA"]) {
  const stepMs = Number.isFinite(Number(segmentMs)) && Number(segmentMs) > 0
    ? Math.max(100, Math.floor(Number(segmentMs)))
    : Math.max(500, Math.ceil(durationMs / keys.length));
  const pulseMs = 50;
  const start = Date.now();
  let nextSwitchAt = start + stepMs;
  let nextPulseAt = start;
  function vectorForKey(key) {
    switch (key) {
      case "KeyW": return { moveX: 0, moveZ: 1 };
      case "KeyS": return { moveX: 0, moveZ: -1 };
      case "KeyA": return { moveX: -1, moveZ: 0 };
      case "KeyD": return { moveX: 1, moveZ: 0 };
      default: return { moveX: 0, moveZ: 0 };
    }
  }
  async function sendVector(vector, stop = false) {
    return await page.evaluate(function (payload) {
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      if (!debug || typeof debug.sendInputState !== "function") return false;
      try {
        debug.sendInputState({
          force: true,
          inputOverride: payload.stop === true
            ? { moveX: 0, moveZ: 0, sprint: false, pointerTarget: null, stop: true }
            : { moveX: payload.moveX, moveZ: payload.moveZ, sprint: false, pointerTarget: null, stop: false }
        });
        return true;
      } catch {
        return false;
      }
    }, Object.assign({ stop: stop === true }, vector));
  }
  try {
    while (Date.now() - start < durationMs) {
      const elapsed = Date.now() - start;
      const desiredIndex = Math.floor(elapsed / stepMs) % keys.length;
      const desiredKey = keys[desiredIndex];
      await sendVector(vectorForKey(desiredKey));
      nextSwitchAt = start + (Math.floor(elapsed / stepMs) + 1) * stepMs;
      const now = Date.now();
      const remaining = durationMs - (now - start);
      if (remaining <= 0) break;
      const waitUntil = Math.min(nextPulseAt + pulseMs, nextSwitchAt, now + remaining);
      const sleepFor = Math.max(0, waitUntil - now);
      await sleep(sleepFor);
      nextPulseAt = Math.max(nextPulseAt + pulseMs, Date.now());
    }
  } finally {
    await sendVector({ moveX: 0, moveZ: 0 }, true);
  }
}

function maxFrameJump(samples) {
  let maxJump = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const prev = samples[index - 1];
    const next = samples[index];
    const jump = Math.hypot(Number(next.x || 0) - Number(prev.x || 0), Number(next.z || 0) - Number(prev.z || 0));
    if (jump > maxJump) maxJump = jump;
  }
  return maxJump;
}

function maxBufferSize(samples) {
  let maxSize = 0;
  for (const sample of samples) {
    const size = Number(sample.snapshotBufferSize || sample.bufferSize || 0) || 0;
    if (size > maxSize) maxSize = size;
  }
  return maxSize;
}

function avgSeries(samples, key) {
  const values = finiteSeries(samples, key);
  if (!values.length) return null;
  return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
}

function maxSeries(samples, key) {
  const values = finiteSeries(samples, key);
  if (!values.length) return null;
  return Math.max.apply(null, values);
}

function finiteSeries(samples, key) {
  const series = [];
  for (const sample of samples || []) {
    const value = Number(sample && sample[key]);
    if (Number.isFinite(value)) series.push(value);
  }
  return series;
}

function hasFiniteDebugMetric(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

async function waitForRemotePlayerVisible(page, playerId, timeoutMs = NAV_TIMEOUT_MS) {
  try {
    await page.waitForFunction(function (wantedPlayerId) {
      const runtime = window.__GK_GAME_RUNTIME;
      if (!runtime || typeof runtime.getRemotePlayerDebugState !== "function") return false;
      const debug = runtime.getRemotePlayerDebugState();
      const runtimeState = typeof runtime.debugState === "function"
        ? runtime.debugState({ includeShadowDiagnostics: false })
        : null;
      const contentChildren = Array.isArray(runtimeState?.contentChildren) ? runtimeState.contentChildren : [];
      return Boolean(
        (debug &&
          Array.isArray(debug.players) &&
          debug.players.some(function (player) {
            return player && player.playerId === wantedPlayerId && player.lastRenderAt > 0 && player.position;
          })) ||
        contentChildren.some(function (child) {
          return child && child.name === "remote-player:" + wantedPlayerId && child.visible !== false;
        })
      );
    }, { timeout: timeoutMs }, playerId);
  } catch (error) {
    const debugInfo = await page.evaluate(function (wantedPlayerId) {
      const runtime = window.__GK_GAME_RUNTIME;
      const debug = runtime && typeof runtime.getRemotePlayerDebugState === "function"
        ? runtime.getRemotePlayerDebugState()
        : null;
      const runtimeState = runtime && typeof runtime.debugState === "function"
        ? runtime.debugState({ includeShadowDiagnostics: false })
        : null;
      const player = debug && Array.isArray(debug.players)
        ? debug.players.find(function (entry) { return entry && entry.playerId === wantedPlayerId; }) || null
        : null;
      return {
        hasRuntime: Boolean(runtime),
        remoteCount: Number(debug?.count || 0),
        player: player ? {
          playerId: player.playerId || null,
          lastRenderAt: Number(player.lastRenderAt || 0) || 0,
          position: player.position ? {
            x: Number(player.position.x) || 0,
            y: Number(player.position.y) || 0,
            z: Number(player.position.z) || 0,
            rotationY: Number(player.position.rotationY) || 0
          } : null,
          renderState: player.renderState ? {
            position: player.renderState.position ? {
              x: Number(player.renderState.position.x) || 0,
              y: Number(player.renderState.position.y) || 0,
              z: Number(player.renderState.position.z) || 0,
              rotationY: Number(player.renderState.position.rotationY) || 0
            } : null,
            snapshotSeq: Number(player.renderState.snapshotSeq || 0) || 0,
            activeControllerSessionId: player.renderState.activeControllerSessionId || null
          } : null,
          root: Boolean(player.root),
          rootParent: Boolean(player.root && player.root.parent)
        } : null,
        contentChildren: Array.isArray(runtimeState?.contentChildren)
          ? runtimeState.contentChildren.filter(function (child) {
            return child && typeof child.name === "string" && child.name.indexOf("remote-player:") === 0;
          }).map(function (child) {
            return {
              name: child.name || "",
              visible: child.visible !== false,
              childCount: Number(child.childCount || 0) || 0
            };
          })
          : []
      };
    }, playerId).catch(function () {
      return { evalError: true };
    });
    console.error("[waitForRemotePlayerVisible debug] " + JSON.stringify(debugInfo));
    throw error;
  }
}

function remoteDistance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.z || 0) - Number(b.z || 0));
}

async function assertPerfHudTopRight(page) {
  const info = await page.evaluate(function () {
    const el = document.querySelector(".perf-hud");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return {
      hasAnchorClass: el.className.indexOf("anchor-top-right") !== -1,
      right: rect.right,
      left: rect.left,
      viewportWidth: window.innerWidth,
      cssRight: style.right,
      cssLeft: style.left
    };
  });
  assert(Boolean(info), "performance HUD element (.perf-hud) staat in de DOM");
  if (!info) return;
  assert(info.hasAnchorClass, "performance HUD element heeft class anchor-top-right");
  assert(info.right > info.viewportWidth - 300, "performance HUD zit tegen de rechterkant van het scherm (right=" + info.right.toFixed(0) + ", viewport=" + info.viewportWidth + ")");
  assert(info.left > info.viewportWidth / 2, "performance HUD staat niet meer linksboven (left=" + info.left.toFixed(0) + ")");
}

async function assertScatterBoundaryBlocksMovement(page) {
  const result = await page.evaluate(function () {
    const runtime = window.__GK_GAME_RUNTIME;
    return runtime.resolvePlayerMovementIntent(
      { x: 60, y: 0, z: 200 },
      { x: 140, y: 0, z: 200 },
      { radius: 0.5 }
    );
  });
  assert(result.blocked === true, "resolvePlayerMovementIntent meldt blocked=true bij het oversteken van de scatter boundary");
  assert(result.x < 100, "beweging stopt vóór het midden van de scatter boundary (x=" + result.x.toFixed(2) + ")");
}

async function assertCameraRelativeWasd(page) {
  const basis = await page.evaluate(function () {
    return window.__GK_GAME_RUNTIME.getCameraGroundBasis();
  });
  assert(Number.isFinite(basis?.forward?.x) && Number.isFinite(basis?.forward?.z), "getCameraGroundBasis() geeft een forward vector terug");
  assert(Number.isFinite(basis?.right?.x) && Number.isFinite(basis?.right?.z), "getCameraGroundBasis() geeft een right vector terug");

  async function prepareForDirection(label) {
    await clearLocalMovement(page, label);
    await page.waitForFunction(function () {
      const runtime = window.__GK_GAME_RUNTIME;
      return Boolean(runtime && typeof runtime.getPlayerState === "function" && runtime.getPlayerState().animationState === "idle");
    }, { timeout: NAV_TIMEOUT_MS });
    await sleep(150);
  }

  await prepareForDirection("wasd reset before W");
  const deltaFor = await measureKeyDelta(page, "KeyW", 500);
  await prepareForDirection("wasd reset before S");
  const deltaBack = await measureKeyDelta(page, "KeyS", 500);
  await prepareForDirection("wasd reset before A");
  const deltaLeft = await measureKeyDelta(page, "KeyA", 500);
  await prepareForDirection("wasd reset before D");
  const deltaRight = await measureKeyDelta(page, "KeyD", 500);

  assert(vecLength(deltaFor) > 0.5, "W verplaatst de speler merkbaar (delta=" + vecLength(deltaFor).toFixed(2) + ")");
  assert(vecLength(deltaBack) > 0.5, "S verplaatst de speler merkbaar (delta=" + vecLength(deltaBack).toFixed(2) + ")");
  assert(vecLength(deltaLeft) > 0.5, "A verplaatst de speler merkbaar (delta=" + vecLength(deltaLeft).toFixed(2) + ")");
  assert(vecLength(deltaRight) > 0.5, "D verplaatst de speler merkbaar (delta=" + vecLength(deltaRight).toFixed(2) + ")");

  assert(cosineSimilarity(deltaFor, basis.forward) > 0.9, "W beweegt in dezelfde richting als camera-forward (cos=" + cosineSimilarity(deltaFor, basis.forward).toFixed(2) + ")");
  assert(cosineSimilarity(deltaBack, basis.forward) < -0.9, "S beweegt tegenovergesteld aan camera-forward (cos=" + cosineSimilarity(deltaBack, basis.forward).toFixed(2) + ")");
  assert(cosineSimilarity(deltaRight, basis.right) > 0.9, "D beweegt in dezelfde richting als camera-right (cos=" + cosineSimilarity(deltaRight, basis.right).toFixed(2) + ")");
  assert(cosineSimilarity(deltaLeft, basis.right) < -0.25, "A beweegt tegenovergesteld aan camera-right (cos=" + cosineSimilarity(deltaLeft, basis.right).toFixed(2) + ")");
  assert(Math.abs(cosineSimilarity(deltaFor, deltaRight)) < 0.35, "W en D staan ongeveer loodrecht op elkaar, zoals bij camera-relatieve besturing (cos=" + cosineSimilarity(deltaFor, deltaRight).toFixed(2) + ")");
}

async function measureKeyDelta(page, code, holdMs) {
  const before = await getPlayerState(page);
  await pressKey(page, code, holdMs);
  await sleep(200);
  const after = await getPlayerState(page);
  return { x: after.x - before.x, z: after.z - before.z };
}

function vecLength(vector) {
  return Math.hypot(vector.x, vector.z);
}

function cosineSimilarity(a, b) {
  const lengthA = vecLength(a);
  const lengthB = Math.hypot(b.x, b.z);
  if (lengthA < 0.0001 || lengthB < 0.0001) return 0;
  return (a.x * b.x + a.z * b.z) / (lengthA * lengthB);
}

async function assertIdleAfterRelease(page) {
  await page.keyboard.down("KeyW");
  await sleep(300);
  const duringMove = await getPlayerState(page);
  assert(duringMove.animationState === "walk" || duringMove.animationState === "run", "animatie tijdens bewegen is walk/run (actual=" + duringMove.animationState + ")");
  await page.keyboard.up("KeyW");
  await sleep(1800);
  const afterRelease = await getPlayerState(page);
  assert(afterRelease.animationState === "idle", "animatie na loslaten van W is idle (actual=" + afterRelease.animationState + ")");
}

async function mouseDownOnCanvas(page, xRatio = 0.65, yRatio = 0.4) {
  const box = await page.evaluate(function (targetXRatio, targetYRatio) {
    const canvas = document.querySelector("#gameCanvas");
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width * targetXRatio,
      y: rect.top + rect.height * targetYRatio
    };
  }, xRatio, yRatio);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  return box;
}

async function mouseHoldOnCanvas(page, holdMs, xRatio = 0.65, yRatio = 0.4) {
  await mouseDownOnCanvas(page, xRatio, yRatio);
  await sleep(holdMs);
  await page.mouse.up();
}

async function clickGameMinimap(page, holdMs = 60, xRatio = 0.65, yRatio = 0.45) {
  const box = await page.evaluate(function (targetXRatio, targetYRatio) {
    const canvas = document.querySelector(".gameMinimapCanvas");
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width * targetXRatio,
      y: rect.top + rect.height * targetYRatio
    };
  }, xRatio, yRatio);
  assert(box, "kan de minimap canvas vinden");
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await sleep(holdMs);
  await page.mouse.up();
}

async function clickNearPlayer(page, worldDistance = 0.08) {
  const point = await screenPointFromPlayer(page, worldDistance);
  assert(point, "kan een klikpunt dicht bij de speler berekenen");
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await sleep(60);
  await page.mouse.up();
}

async function screenPointFromPlayer(page, worldDistance = 0.2) {
  return await screenPointFromPlayerOffset(page, worldDistance, 0);
}

async function screenPointFromPlayerOffset(page, rightDistance = 0, forwardDistance = 0) {
  const point = await page.evaluate(function (rightDistanceValue, forwardDistanceValue) {
    const runtime = window.__GK_GAME_RUNTIME;
    if (!runtime || typeof runtime.getPlayerState !== "function" || typeof runtime.getCameraGroundBasis !== "function" || typeof runtime.worldToScreen !== "function") {
      return null;
    }
    const player = runtime.getPlayerState();
    const basis = runtime.getCameraGroundBasis();
    const target = {
      x: player.x + basis.right.x * rightDistanceValue + basis.forward.x * forwardDistanceValue,
      y: player.y,
      z: player.z + basis.right.z * rightDistanceValue + basis.forward.z * forwardDistanceValue
    };
    const screen = runtime.worldToScreen(target);
    return {
      x: screen.x,
      y: screen.y
    };
  }, rightDistance, forwardDistance);
  return point;
}

async function lostPointerCaptureOnCanvas(page, holdMs, xRatio = 0.75, yRatio = 0.3) {
  await page.evaluate(function (durationMs, ratios) {
    return new Promise(function (resolve) {
      const canvas = document.querySelector("#gameCanvas");
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * ratios.xRatio;
      const y = rect.top + rect.height * ratios.yRatio;
      const pointerId = 9002;
      const down = new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: pointerId,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
        button: 0
      });
      const lost = new PointerEvent("lostpointercapture", {
        bubbles: true,
        cancelable: true,
        pointerId: pointerId,
        pointerType: "mouse",
        clientX: x,
        clientY: y,
        button: 0
      });
      canvas.dispatchEvent(down);
      setTimeout(function () {
        canvas.dispatchEvent(lost);
        resolve();
      }, durationMs);
    });
  }, holdMs, { xRatio: xRatio, yRatio: yRatio });
}

async function touchHoldOnCanvas(page, holdMs) {
  await page.evaluate(function (durationMs) {
    return new Promise(function (resolve) {
      const canvas = document.querySelector("#gameCanvas");
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width * 0.35;
      const y = rect.top + rect.height * 0.6;
      const pointerId = 9001;
      const fire = function (type) {
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: pointerId,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          button: 0
        }));
      };
      fire("pointerdown");
      setTimeout(function () {
        fire("pointerup");
        resolve();
      }, durationMs);
    });
  }, holdMs);
}

async function adminLogin() {
  const response = await call("POST", "/api/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (response.status !== 200 || !response.json || !response.json.ok) {
    throw new Error("Admin login mislukt: " + response.status + " " + response.text);
  }
}

async function buildAndPublishWorld() {
  const wizardAsset = await importModelAsset({
    relativePath: "assets/uploads/wizard.glb",
    name: "Browser Check Wizard",
    filename: "browser-check-wizard.glb",
    category: "characters"
  });
  const treeAsset = await importModelAsset({
    relativePath: "assets/uploads/stylize-tree-lowpoly.glb",
    name: "Browser Check Tree",
    filename: "browser-check-tree.glb",
    category: "environment"
  });

  let graph = (await call("GET", "/api/editor/graph")).json;
  const gameOutputNode = findNode(graph, function (node) { return node.type === "game_output"; }, "game output bestaat");

  const autoConnect = async function (type, values, matcher, port) {
    graph = (await createNode(type, values)).graph;
    const node = findNode(graph, matcher, "node " + type + " aangemaakt");
    graph = await connect(graph, node.id, port.from, gameOutputNode.id, port.to);
    return node;
  };

  await autoConnect("world_settings", {
    worldId: "browser_check_world",
    displayName: "Browser Check World",
    backgroundColor: "#0b1622",
    fogColor: "#0b1622",
    fogDensity: 0
  }, function (n) { return n.type === "world_settings"; }, { from: "world", to: "world" });

  await autoConnect("editor_world_settings", worldSettingsPresetNodePatch("editor", "geen_schaduw"), function (n) { return n.type === "editor_world_settings"; }, { from: "editorWorldSettings", to: "editorWorldSettings" });
  await autoConnect("game_world_settings", worldSettingsPresetNodePatch("game", "geen_schaduw"), function (n) { return n.type === "game_world_settings"; }, { from: "gameWorldSettings", to: "gameWorldSettings" });
  await autoConnect("game_chunk_loading", {
    chunkProfileId: "game_chunks",
    enabled: true,
    chunkWidth: 25,
    chunkDepth: 25,
    tileSize: 1,
    preloadMarginChunks: 1,
    unloadMarginChunks: 1,
    maxLoadedChunks: 9,
    debugOverlay: false,
    groundChunkingEnabled: true,
    pathWaterSurfaceChunkingEnabled: false,
    terrainVisualChunkingEnabled: false,
    cameraOnly: true,
    gameViewRadiusChunks: 1,
    fixedCameraPaddingTiles: 0,
    strictUnloadOutsideCamera: true,
    loadBudgetPerFrame: 2,
    residentChunkBuildBudgetPerFrame: 2,
    residentEntityBudget: 200,
    residentObjectBudget: 300,
    residentScatterInstanceBudget: 500
  }, function (n) { return n.type === "game_chunk_loading"; }, { from: "chunkLoading", to: "chunkLoading" });

  await autoConnect("ground_surface", {
    groundId: "browser_check_ground",
    width: 600,
    depth: 600,
    y: 0,
    boundsMode: "centerSize",
    materialColor: "#3f6b3f"
  }, function (n) { return n.type === "ground_surface"; }, { from: "ground", to: "ground" });

  await autoConnect("game_camera", {
    cameraId: "browser_check_camera",
    pitch: 55,
    yaw: 15,
    startDistance: 22,
    distance: 22,
    minDistance: 8,
    maxDistance: 60,
    fov: 55,
    follow: true,
    rotateSpeed: 90
  }, function (n) { return n.type === "game_camera"; }, { from: "camera", to: "camera" });

  await autoConnect("player_spawn", {
    spawnId: "browser_check_spawn",
    x: 0,
    z: 0,
    facing: 0
  }, function (n) { return n.type === "player_spawn"; }, { from: "spawn", to: "spawn" });

  await autoConnect("player_character", {
    playerId: "browser_check_player",
    modelAssetId: wizardAsset.asset.id,
    animationClip: "Idle",
    idleAnimation: "Idle",
    walkAnimation: "Walk",
    runAnimation: "Run",
    moveSpeed: 7,
    sprintMultiplier: 1.6,
    turnSpeed: 600,
    collisionRadius: 0.5,
    scale: 1
  }, function (n) { return n.type === "player_character"; }, { from: "player", to: "player" });

  await autoConnect("ambient_light", {
    lightId: "browser_check_ambient",
    color: "#ffffff",
    intensity: 0.9
  }, function (n) { return n.type === "ambient_light"; }, { from: "light", to: "lights" });

  await autoConnect("bounded_area_scatter", {
    scatterId: "browser_check_scatter",
    enabled: true,
    areaCenterX: 100,
    areaCenterZ: 200,
    areaWidth: 60,
    areaDepth: 60,
    areaRotationY: 0,
    count: 4,
    sourceAssetIds: [treeAsset.asset.id],
    randomObjectSelection: false,
    boundaryBlocksPlayer: true,
    seed: "browser_check_seed",
    scaleMin: 0.9,
    scaleMax: 1.1,
    rotationYMin: 0,
    rotationYMax: 360,
    points: [
      { x: 70, z: 170 },
      { x: 130, z: 170 },
      { x: 130, z: 230 },
      { x: 70, z: 230 }
    ]
  }, function (n) { return n.type === "bounded_area_scatter"; }, { from: "entity", to: "entities" });

  await autoConnect("bounded_area_scatter", {
    scatterId: "browser_check_flicker_scatter",
    enabled: true,
    areaCenterX: 112,
    areaCenterZ: 0,
    areaWidth: 12,
    areaDepth: 12,
    areaRotationY: 0,
    count: 14,
    sourceAssetIds: [treeAsset.asset.id],
    randomObjectSelection: false,
    boundaryBlocksPlayer: false,
    seed: "browser_check_flicker_seed",
    scaleMin: 0.95,
    scaleMax: 1.05,
    rotationYMin: 0,
    rotationYMax: 360,
    points: [
      { x: 106, z: -6 },
      { x: 118, z: -6 },
      { x: 118, z: 6 },
      { x: 106, z: 6 }
    ]
  }, function (n) { return n.type === "bounded_area_scatter" && n.values.scatterId === "browser_check_flicker_scatter"; }, { from: "entity", to: "entities" });

  await autoConnect("debug_mmo_hud", {
    hudId: "browser_check_mmo_debug_hud",
    enabled: true,
    anchor: "top-left",
    compact: true,
    startCollapsed: true,
    showWsStatus: true,
    showUser: true,
    showPlayer: true,
    showSession: false,
    showPosition: true,
    showRevision: true,
    showSessions: false,
    showLastSent: true,
    showLastSentSeq: true,
    showLastAckedSeq: true,
    showPendingInputs: true,
    showController: true,
    showLastTransport: true,
    showLastIgnored: true,
    showServerSeq: true,
    showLastReceived: true,
    showLastSource: true,
    showLastError: true
  }, function (n) { return n.type === "debug_mmo_hud"; }, { from: "ui", to: "ui" });

  await autoConnect("debug_performance_hud", {
    hudId: "browser_check_perf_hud",
    label: "Performance HUD",
    enabled: true,
    anchor: "top-right",
    compact: true,
    updateIntervalMs: 500,
    showFps: true,
    showFrameMs: true,
    showRenderer: true,
    showDrawCalls: true,
    showTriangles: false,
    showGeometries: false,
    showTextures: false,
    showSceneObjects: false,
    showEntities: false,
    showScatterInstances: false,
    showTerrainVisuals: false,
    showCollisionShapes: true,
    showWorldSize: false,
    showChunkCulling: false
  }, function (n) { return n.type === "debug_performance_hud"; }, { from: "ui", to: "ui" });

  const publish = await call("POST", "/api/editor/publish");
  if (publish.status !== 200 || !publish.json || !publish.json.ok) {
    throw new Error("Publish mislukt: " + publish.status + " " + publish.text);
  }
}

async function importModelAsset({ relativePath, name, filename, category }) {
  const assetPath = path.join(rootDir, relativePath);
  const blob = new Blob([fs.readFileSync(assetPath)], { type: "model/gltf-binary" });
  const result = await uploadAsset({ name, category, assetType: "model", blob, filename });
  if (result.status !== 201 || !result.json || !result.json.asset) {
    throw new Error("Upload mislukt voor " + name + ": " + result.status + " " + result.text);
  }
  const asset = result.json.asset;
  if (asset.sourcePath) uploadedAssetCleanupPaths.add(asset.sourcePath);
  if (asset.thumbnailPath) uploadedAssetCleanupPaths.add(asset.thumbnailPath);
  return result.json;
}

function cleanupUploadedAssetFiles() {
  // The published test world still references these assets when the server shuts down, so the
  // DELETE API (which blocks in-use assets) can't remove them; this is fixture cleanup for a
  // throwaway ephemeral world, not a product behavior, so we remove the uploaded files directly.
  for (const assetPath of uploadedAssetCleanupPaths) {
    if (!assetPath || typeof assetPath !== "string") continue;
    const normalized = assetPath.startsWith("/") ? assetPath.slice(1) : assetPath;
    const filePath = path.isAbsolute(assetPath) ? assetPath : path.join(rootDir, normalized);
    try { fs.rmSync(filePath, { force: true }); } catch {}
  }
}

async function uploadAsset({ name, category, assetType, blob, filename }) {
  const form = new FormData();
  form.append("name", name);
  form.append("category", category);
  form.append("assetType", assetType);
  form.append("file", blob, filename);
  return await call("POST", "/api/assets/import", form, true);
}

async function createNode(type, values) {
  const response = await call("POST", "/api/editor/nodes", { type, values });
  const graph = response.json && (response.json.graph || response.json);
  if (response.status !== 201 || !graph) {
    throw new Error("Node create mislukt voor " + type + ": " + response.status + " " + response.text);
  }
  return response.json.graph ? response.json : { graph };
}

async function connect(graph, fromNodeId, fromPort, toNodeId, toPort) {
  const existing = Array.isArray(graph.edges) && graph.edges.some(function (edge) {
    return edge.fromNodeId === fromNodeId && edge.fromPort === fromPort && edge.toNodeId === toNodeId && edge.toPort === toPort;
  });
  if (existing) return graph;
  const response = await call("POST", "/api/editor/edges", { edge: { fromNodeId, fromPort, toNodeId, toPort } });
  const nextGraph = response.json && (response.json.graph || response.json);
  if (response.status !== 201 || !nextGraph) {
    throw new Error("Edge create mislukt: " + response.status + " " + response.text);
  }
  return nextGraph;
}

function findNode(graph, predicate, label) {
  const node = Array.isArray(graph?.nodes) ? graph.nodes.find(predicate) : null;
  if (!node) throw new Error("Kon node niet vinden: " + label);
  return node;
}

async function call(method, pathname, body, isForm) {
  const headers = {};
  if (cookie) headers.Cookie = cookie;
  let payload = body;
  if (body && !isForm) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + pathname, { method, headers, body: payload });
  setCookieFrom(response);
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, json, text };
}

function setCookieFrom(response) {
  const raw = response.headers.get("set-cookie");
  if (raw) cookie = raw.split(";")[0];
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE + "/api/health");
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error("Server startte niet binnen de timeout.");
}

async function reservePort() {
  return await new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(function () { resolve(String(port)); });
    });
  });
}

function killLeakedThumbnailProcesses() {
  // Server-side GLB-thumbnail generation is fire-and-forget (see asset-service.js) and can hang under
  // headless Xvfb in constrained sandboxes; clean up our own uploads' orphaned subprocesses so repeated
  // local runs of this script don't leak Chrome/Xvfb processes and starve the next Puppeteer launch.
  for (const needle of ["browser-check-wizard.glb", "browser-check-tree.glb"]) {
    try {
      execSync("pkill -9 -f " + JSON.stringify(needle));
    } catch {
      // pkill exits non-zero when nothing matched; that's fine.
    }
  }
}

async function stopServer(server) {
  if (!server) return;
  await new Promise(function (resolve) {
    const finished = function () { resolve(); };
    server.once("exit", finished);
    server.once("close", finished);
    server.kill("SIGTERM");
    setTimeout(function () {
      if (server.exitCode === null) {
        try { server.kill("SIGKILL"); } catch {}
      }
    }, 5000).unref?.();
  }).catch(function () {});
}
