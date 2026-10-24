// Speelgevoel-meting op een KOPIE van een echte wereld (twee nep-spelers, afgeschermde testserver).
//
//   GK_TEST_ISOLATED=1 GK_WORLD_SOURCE_DB=storage/gk-real-node-editor.sqlite npm run feel:world-copy
//
// Legt per frame vast waar beide spelers getekend worden en meet wat Kevin ziet: terugspringen of heen en
// weer lopen na een klik, verspringen na loslaten, terugschieten na een portalreis, en een medespeler die
// zichtbaar door de wereld "vliegt". Zie scripts/lib/world-copy.js voor wat er wel en niet gekopieerd wordt.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { startWorldCopyServer, registerTestPlayer, openGameAs, sleep } from "./lib/world-copy.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORT = { width: Number(process.env.GK_FEEL_WIDTH) || 800, height: Number(process.env.GK_FEEL_HEIGHT) || 450 };
const PORTAL_LINK_ID = process.env.GK_FEEL_PORTAL_LINK || "zone_link.object.3";

function installRecorder(page) {
  return page.evaluate(function () {
    const feel = { samples: [], marks: [], running: true };
    window.__feel = feel;
    const loop = function () {
      if (!feel.running) return;
      const runtime = window.__GK_GAME_RUNTIME;
      const debug = window.__GK_GAME_CLIENT_DEBUG;
      const player = runtime.getPlayerState();
      const positions = debug.getPositions();
      const remote = runtime.getRemotePlayerDebugState().players.map(function (entry) {
        return { id: entry.playerId, x: entry.position ? entry.position.x : null, z: entry.position ? entry.position.z : null };
      });
      feel.samples.push({
        rebuilds: positions.worldRebuilds,
        wall: performance.timeOrigin + performance.now(),
        t: performance.now(),
        x: player.x,
        z: player.z,
        anim: player.animationState,
        ax: positions.authoritative ? positions.authoritative.x : null,
        az: positions.authoritative ? positions.authoritative.z : null,
        zone: positions.zoneId,
        remote: remote
      });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return true;
  });
}

async function mark(page, label, extra = {}) {
  await page.evaluate(function (entry) { window.__feel.marks.push(Object.assign({ t: performance.now() }, entry)); }, Object.assign({ label }, extra));
}

async function playerState(page) {
  return page.evaluate(function () {
    const player = window.__GK_GAME_RUNTIME.getPlayerState();
    const positions = window.__GK_GAME_CLIENT_DEBUG.getPositions();
    return { x: player.x, z: player.z, anim: player.animationState, zone: positions.zoneId, ax: positions.authoritative && positions.authoritative.x, az: positions.authoritative && positions.authoritative.z };
  });
}

async function waitIdle(page, timeoutMs = 12000) {
  await page.waitForFunction(function () {
    return window.__GK_GAME_RUNTIME.getPlayerState().animationState === "idle";
  }, { timeout: timeoutMs }).catch(function () {});
}

async function clickWorld(page, point) {
  const screen = await page.evaluate(function (target) {
    const runtime = window.__GK_GAME_RUNTIME;
    const player = runtime.getPlayerState();
    return runtime.worldToScreen({ x: target.x, y: player.y, z: target.z });
  }, point);
  if (!screen) return false;
  await page.mouse.click(screen.x, screen.y);
  return true;
}

async function clickMove(page, label, dx, dz) {
  const start = await playerState(page);
  const target = { x: start.x + dx, z: start.z + dz };
  await mark(page, label, { kind: "click", target, start: { x: start.x, z: start.z } });
  await clickWorld(page, target);
  await sleep(300);
  await waitIdle(page);
  await sleep(1800);
  await mark(page, label + ":end");
}

async function keyMove(page, label, key, holdMs) {
  const start = await playerState(page);
  await mark(page, label, { kind: "key", start: { x: start.x, z: start.z } });
  await page.keyboard.down(key);
  await sleep(holdMs);
  await page.keyboard.up(key);
  await mark(page, label + ":release", { kind: "release" });
  await sleep(1800);
  await mark(page, label + ":end");
}

async function portalScreenPoint(page, linkId, portal) {
  return page.evaluate(function (id, target) {
    const runtime = window.__GK_GAME_RUNTIME;
    const player = runtime.getPlayerState();
    for (const height of [1.5, 1, 2.5, 0.5, 3]) {
      const screen = runtime.worldToScreen({ x: target.x, y: player.y + height, z: target.z });
      if (!screen || screen.x < 10 || screen.y < 10 || screen.x > window.innerWidth - 10 || screen.y > window.innerHeight - 10) continue;
      const picked = runtime.pickRuntimeTargetAt(screen.x, screen.y);
      if (picked && String(picked.instanceId) === id) return { x: screen.x, y: screen.y };
    }
    return null;
  }, linkId, portal);
}

async function portalTravel(page, label, linkId, portal) {
  // Eerst in de buurt komen met grondklikken, tot het portal aanklikbaar in beeld staat.
  let point = await portalScreenPoint(page, linkId, portal);
  for (let attempt = 0; !point && attempt < 10; attempt += 1) {
    const here = await playerState(page);
    const dx = portal.x - here.x;
    const dz = portal.z - here.z;
    const length = Math.hypot(dx, dz) || 1;
    const step = Math.min(10, Math.max(0, length - 9));
    await clickWorld(page, { x: here.x + (dx / length) * step, z: here.z + (dz / length) * step });
    await sleep(300);
    await waitIdle(page);
    await sleep(800);
    point = await portalScreenPoint(page, linkId, portal);
  }
  if (!point) return { ok: false, reason: "portal niet aanklikbaar" };
  const before = await playerState(page);
  await mark(page, label, { kind: "portal", start: { x: before.x, z: before.z }, portal, zone: before.zone });
  await page.mouse.click(point.x, point.y);
  const deadline = Date.now() + 15000;
  let after = before;
  while (Date.now() < deadline) {
    await sleep(200);
    after = await playerState(page);
    if (after.zone && after.zone !== before.zone) break;
  }
  await mark(page, label + ":arrived", { zone: after.zone });
  await sleep(4000);
  await mark(page, label + ":end");
  return { ok: after.zone !== before.zone, fromZone: before.zone, toZone: after.zone };
}

// Houd de muis ingedrukt in de looprichting (zoals Kevin loopt) tot de zone wisselt, en nog even daarna.
async function walkAcrossZoneBorder(page, label, direction, timeoutMs = 60000) {
  const before = await playerState(page);
  await mark(page, label, { kind: "border", zone: before.zone, start: { x: before.x, z: before.z } });
  const point = await page.evaluate(function (dir) {
    const runtime = window.__GK_GAME_RUNTIME;
    const player = runtime.getPlayerState();
    return runtime.worldToScreen({ x: player.x + dir.x * 6, y: player.y, z: player.z + dir.z * 6 });
  }, direction);
  if (!point) return { ok: false };
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  const deadline = Date.now() + timeoutMs;
  let changedAt = 0;
  let after = before;
  while (Date.now() < deadline) {
    await sleep(250);
    after = await playerState(page);
    if (!changedAt && after.zone && after.zone !== before.zone) changedAt = Date.now();
    if (changedAt && Date.now() - changedAt > 3000) break;
  }
  await page.mouse.up();
  await sleep(2000);
  await mark(page, label + ":end");
  return { ok: Boolean(changedAt), fromZone: before.zone, toZone: after.zone };
}

function analyzeBorder(feel, label) {
  const seg = segment(feel, label);
  if (!seg || !seg.samples.length) return label + ": geen samples";
  let zoneFlips = 0;
  for (let index = 1; index < seg.samples.length; index += 1) if (seg.samples[index].zone !== seg.samples[index - 1].zone) zoneFlips += 1;
  const rebuilds = (seg.samples[seg.samples.length - 1].rebuilds || 0) - (seg.samples[0].rebuilds || 0);
  const step = maxStep(seg.samples, function (sample) { return sample; });
  const last = seg.samples[seg.samples.length - 1];
  return label + ": zonewissels " + zoneFlips + ", wereld herbouwd " + rebuilds + "x, grootste framesprong " + step.max.toFixed(2) + " in " + step.dt.toFixed(0) + " ms, eindzone " + last.zone + ", client-server " + (last.ax === null ? "-" : Math.hypot(last.x - last.ax, last.z - last.az).toFixed(2));
}

// Loop met klikstappen (max ~9 eenheden, binnen beeld) naar een punt.
async function walkTo(page, target, maxSteps = 60) {
  for (let step = 0; step < maxSteps; step += 1) {
    const here = await playerState(page);
    const dx = target.x - here.x;
    const dz = target.z - here.z;
    const length = Math.hypot(dx, dz);
    if (length < 1) return true;
    const stepLength = Math.min(9, length);
    await clickWorld(page, { x: here.x + (dx / length) * stepLength, z: here.z + (dz / length) * stepLength });
    await sleep(250);
    await waitIdle(page, 8000);
  }
  return false;
}

// Kevin-handtest 2026-10-24: route langs het bos in de Test-zone. In de game liep je erheen, bij stilstaan volgde
// een rubberband terug naar de server die vastzat tegen de bomen (client botste alleen tegen geladen bomen).
async function forestRoute(page, label, waypoints) {
  const before = await playerState(page);
  await mark(page, label, { kind: "forest", start: { x: before.x, z: before.z } });
  for (const point of waypoints) await walkTo(page, point);
  await sleep(2500);
  await mark(page, label + ":end");
}

// Hoe ver lag de server ooit van de route die de speler liep (afsnijden = grote afwijking)?
function serverRouteDeviation(samples) {
  const route = samples.map(function (sample) { return { x: sample.x, z: sample.z }; });
  let worst = 0;
  for (const sample of samples) {
    if (sample.ax === null) continue;
    let best = Infinity;
    for (let index = 1; index < route.length; index += 1) {
      const a = route[index - 1];
      const b = route[index];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const length = abx * abx + abz * abz;
      const t = length > 0 ? Math.max(0, Math.min(1, ((sample.ax - a.x) * abx + (sample.az - a.z) * abz) / length)) : 0;
      best = Math.min(best, Math.hypot(sample.ax - (a.x + abx * t), sample.az - (a.z + abz * t)));
    }
    if (Number.isFinite(best)) worst = Math.max(worst, best);
  }
  return worst;
}

function analyzeForest(feel, label) {
  const seg = segment(feel, label);
  if (!seg || !seg.samples.length) return label + ": geen samples";
  let maxGap = 0;
  for (const sample of seg.samples) if (sample.ax !== null) maxGap = Math.max(maxGap, Math.hypot(sample.x - sample.ax, sample.z - sample.az));
  const deviation = serverRouteDeviation(seg.samples);
  const last = seg.samples[seg.samples.length - 1];
  const step = maxStep(seg.samples, function (sample) { return sample; });
  return label + ": eind (" + last.x.toFixed(1) + ", " + last.z.toFixed(1) + "), server wijkt max " + deviation.toFixed(2) + " af van de gelopen route, achterstand onderweg max " + maxGap.toFixed(2) + ", na stoppen " + (last.ax === null ? "-" : Math.hypot(last.x - last.ax, last.z - last.az).toFixed(2)) + ", grootste framesprong " + step.max.toFixed(2);
}

function segment(feel, label) {
  const start = feel.marks.find(function (entry) { return entry.label === label; });
  const end = feel.marks.find(function (entry) { return entry.label === label + ":end"; });
  if (!start || !end) return null;
  return { start, end, samples: feel.samples.filter(function (sample) { return sample.t >= start.t && sample.t <= end.t; }) };
}

function maxStep(samples, accessor) {
  let max = 0;
  let maxDt = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const a = accessor(samples[index - 1]);
    const b = accessor(samples[index]);
    if (!a || !b || a.x === null || b.x === null) continue;
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    if (step > max) { max = step; maxDt = samples[index].t - samples[index - 1].t; }
  }
  return { max, dt: maxDt };
}

function analyzeClick(feel, label) {
  const seg = segment(feel, label);
  if (!seg || !seg.samples.length) return label + ": geen samples";
  const target = seg.start.target;
  let reversals = 0;
  let reversalDistance = 0;
  let arrivedAt = -1;
  for (let index = 1; index < seg.samples.length; index += 1) {
    const prev = seg.samples[index - 1];
    const cur = seg.samples[index];
    const dPrev = Math.hypot(prev.x - target.x, prev.z - target.z);
    const dCur = Math.hypot(cur.x - target.x, cur.z - target.z);
    if (arrivedAt < 0 && dCur < 0.8) arrivedAt = index;
    if (dCur > dPrev + 0.03) { reversals += 1; reversalDistance += dCur - dPrev; }
  }
  const last = seg.samples[seg.samples.length - 1];
  const arrival = arrivedAt >= 0 ? seg.samples[arrivedAt] : last;
  let driftAfterArrival = 0;
  for (const sample of seg.samples.slice(Math.max(0, arrivedAt))) driftAfterArrival = Math.max(driftAfterArrival, Math.hypot(sample.x - arrival.x, sample.z - arrival.z));
  const step = maxStep(seg.samples, function (sample) { return sample; });
  const frames = seg.samples.length;
  const durationMs = seg.end.t - seg.start.t;
  return label + ": eind " + Math.hypot(last.x - target.x, last.z - target.z).toFixed(2) + " van doel, terugbewegingen " + reversals + " (" + reversalDistance.toFixed(2) + "), drift na aankomst " + driftAfterArrival.toFixed(2) + ", grootste framesprong " + step.max.toFixed(2) + " in " + step.dt.toFixed(0) + " ms, client-server " + (last.ax === null ? "-" : Math.hypot(last.x - last.ax, last.z - last.az).toFixed(2)) + ", " + (frames / (durationMs / 1000)).toFixed(1) + " fps";
}

function analyzeKey(feel, label) {
  const seg = segment(feel, label);
  if (!seg) return label + ": geen samples";
  const release = feel.marks.find(function (entry) { return entry.label === label + ":release"; });
  const afterRelease = seg.samples.filter(function (sample) { return sample.t >= release.t; });
  const atRelease = afterRelease[0];
  let backwards = 0;
  const direction = atRelease && seg.samples[0] ? { x: atRelease.x - seg.samples[0].x, z: atRelease.z - seg.samples[0].z } : { x: 0, z: 0 };
  for (let index = 1; index < afterRelease.length; index += 1) {
    const stepX = afterRelease[index].x - afterRelease[index - 1].x;
    const stepZ = afterRelease[index].z - afterRelease[index - 1].z;
    if (stepX * direction.x + stepZ * direction.z < -0.0001) backwards += Math.hypot(stepX, stepZ);
  }
  const last = seg.samples[seg.samples.length - 1];
  const settle = atRelease ? Math.hypot(last.x - atRelease.x, last.z - atRelease.z) : 0;
  const step = maxStep(seg.samples, function (sample) { return sample; });
  return label + ": na loslaten nog " + settle.toFixed(2) + " verschoven, waarvan terug " + backwards.toFixed(2) + ", grootste framesprong " + step.max.toFixed(2) + ", client-server " + (last.ax === null ? "-" : Math.hypot(last.x - last.ax, last.z - last.az).toFixed(2));
}

function analyzePortal(feel, label, result) {
  const seg = segment(feel, label);
  if (!seg) return label + ": geen samples";
  const fromZone = seg.start.zone;
  const portal = seg.start.portal;
  const inNewZone = seg.samples.filter(function (sample) { return sample.zone && sample.zone !== fromZone; });
  const before = seg.samples.filter(function (sample) { return !inNewZone.includes(sample); });
  // Liep de speler vloeiend naar het portal? Afstand tot het portal vlak voor de reis.
  const lastBefore = before[before.length - 1];
  const distanceAtTravel = lastBefore ? Math.hypot(lastBefore.x - portal.x, lastBefore.z - portal.z) : null;
  const walk = maxStep(before, function (sample) { return sample; });
  let reversals = 0;
  for (let index = 1; index < before.length; index += 1) {
    const dPrev = Math.hypot(before[index - 1].x - portal.x, before[index - 1].z - portal.z);
    const dCur = Math.hypot(before[index].x - portal.x, before[index].z - portal.z);
    if (dCur > dPrev + 0.03) reversals += 1;
  }
  if (!inNewZone.length) return label + ": GEEN reis (zone bleef " + fromZone + "), afstand tot portal " + (distanceAtTravel === null ? "-" : distanceAtTravel.toFixed(2)) + ", terugbewegingen " + reversals;
  const arrival = inNewZone[0];
  let maxDeviation = 0;
  for (const sample of inNewZone) maxDeviation = Math.max(maxDeviation, Math.hypot(sample.x - arrival.x, sample.z - arrival.z));
  const switchedBack = inNewZone.some(function (sample, index) { return index > 0 && sample.zone !== arrival.zone; });
  const last = inNewZone[inNewZone.length - 1];
  return label + ": " + fromZone + " -> " + arrival.zone + ", afstand tot portal bij vertrek " + (distanceAtTravel === null ? "-" : distanceAtTravel.toFixed(2)) + ", terugbewegingen onderweg " + reversals + ", grootste framesprong onderweg " + walk.max.toFixed(2) + ", na aankomst max " + maxDeviation.toFixed(2) + " verschoven" + (switchedBack ? ", ZONE WISSELDE TERUG" : "") + ", client-server na 4 s " + (last.ax === null ? "-" : Math.hypot(last.x - last.ax, last.z - last.az).toFixed(2));
}

function analyzeRemote(feel, label, playerId) {
  const seg = segment(feel, label);
  if (!seg) return label + " (medespeler): geen samples";
  const track = seg.samples.map(function (sample) {
    const remote = sample.remote.find(function (entry) { return entry.id === playerId; });
    return remote && remote.x !== null ? { t: sample.t, x: remote.x, z: remote.z } : { t: sample.t, x: null, z: null };
  });
  let flyFrames = 0;
  let maxFly = 0;
  let teleports = 0;
  let visibleFrames = 0;
  for (let index = 1; index < track.length; index += 1) {
    const a = track[index - 1];
    const b = track[index];
    if (b.x !== null) visibleFrames += 1;
    if (a.x === null || b.x === null) continue;
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    const dt = Math.max(1, b.t - a.t) / 1000;
    const speed = step / dt;
    if (step > 30) teleports += 1;
    else if (speed > 25) { flyFrames += 1; maxFly = Math.max(maxFly, step); }
  }
  return label + " (medespeler gezien door de ander): " + visibleFrames + " frames zichtbaar, " + flyFrames + " frames sneller dan 25/s (max sprong " + maxFly.toFixed(2) + "), harde teleports " + teleports;
}

// Hoeveel ms ziet de ander je achter? Voor elke frame waarin B speler A ziet bewegen: het moment waarop A zelf
// op die plek was (zelfde klok, wall time). Mediaan en p90.
function analyzeRemoteDelay(feelLocal, feelObserver, label, playerId) {
  const seg = segment(feelObserver, label);
  if (!seg) return label + ": geen samples";
  const local = feelLocal.samples;
  const delays = [];
  let previous = null;
  for (const sample of seg.samples) {
    const remote = sample.remote.find(function (entry) { return entry.id === playerId; });
    if (!remote || remote.x === null) { previous = null; continue; }
    if (previous && Math.hypot(remote.x - previous.x, remote.z - previous.z) > 0.05) {
      let best = null;
      for (const own of local) {
        if (own.wall > sample.wall || own.wall < sample.wall - 2000) continue;
        const distance = Math.hypot(own.x - remote.x, own.z - remote.z);
        if (!best || distance < best.distance) best = { distance, wall: own.wall };
      }
      if (best && best.distance < 0.6) delays.push(sample.wall - best.wall);
    }
    previous = remote;
  }
  if (!delays.length) return label + ": geen bewegende frames";
  delays.sort(function (a, b) { return a - b; });
  const pick = function (q) { return delays[Math.min(delays.length - 1, Math.floor(q * delays.length))]; };
  return label + ": medespeler loopt " + Math.round(pick(0.5)) + " ms achter (p90 " + Math.round(pick(0.9)) + " ms, " + delays.length + " frames)";
}

async function main() {
  const world = await startWorldCopyServer(rootDir, "feel");
  let browser = null;
  try {
    console.log("Wereldtabellen gekopieerd: " + JSON.stringify(world.counts));
    const cookieA = await registerTestPlayer(world.base, "feel_a");
    const cookieB = await registerTestPlayer(world.base, "feel_b");
    const puppeteerModule = await import("puppeteer");
    const puppeteer = puppeteerModule.default || puppeteerModule;
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote", "--enable-unsafe-swiftshader", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"] });
    // De software-renderer eet beide CPU-kernen op; geef de testserver voorrang, anders loopt die achter.
    try { execSync("for p in $(pgrep -f puppeteer_dev_chrome_profile); do renice -n 15 -p $p >/dev/null; done", { shell: "/bin/sh" }); } catch {}
    const pageB = await openGameAs(browser, world.base, cookieB, VIEWPORT);
    const pageA = await openGameAs(browser, world.base, cookieA, VIEWPORT);
    await sleep(6000);
    const renderCost = async function (page, label) {
      const profile = await page.evaluate(function (name) {
        return window.__GK_GAME_RUNTIME.profilePerformance({ frames: 20, warmupFrames: 4, label: name });
      }, label).catch(function (error) { return { error: String(error && error.message || error) }; });
      if (profile.error) return label + ": " + profile.error;
      const counts = profile.counts || {};
      return label + ": draw calls " + counts.drawCalls + ", driehoeken " + counts.triangles + ", meshes " + counts.meshes + ", objecten " + counts.sceneObjects + ", chunks " + counts.loadedChunks + ", render-CPU gem " + Number(profile.averages?.renderMs || 0).toFixed(1) + " ms, schaduw " + JSON.stringify(profile.shadows || profile.shadowPolicy || null).slice(0, 160);
    };
    console.log("Renderkosten " + await renderCost(pageA, "start"));
    await installRecorder(pageA);
    await installRecorder(pageB);
    const idA = await pageA.evaluate(function () { return window.__GK_GAME_CLIENT_DEBUG.getPositions().playerId; });
    const idB = await pageB.evaluate(function () { return window.__GK_GAME_CLIENT_DEBUG.getPositions().playerId; });

    const clicks = [["klik kort 1.5", 1.5, 0], ["klik 3", 0, 3], ["klik 6", -6, 0], ["klik 12", 0, -12], ["klik kort 1 terug", 0, 1]];
    for (const [label, dx, dz] of clicks) {
      await mark(pageB, label);
      await clickMove(pageA, label, dx, dz);
      await mark(pageB, label + ":end");
    }
    await mark(pageB, "toets W");
    await keyMove(pageA, "toets W", "KeyW", 1200);
    await mark(pageB, "toets W:end");

    const portalPosition = await pageA.evaluate(function (linkId) {
      const found = window.__GK_GAME_CLIENT_DEBUG.getInteractionTargets().find(function (target) { return target.instanceId === linkId; });
      return found ? { x: found.x, z: found.z } : null;
    }, PORTAL_LINK_ID);
    console.log("Portal " + PORTAL_LINK_ID + ": " + JSON.stringify(portalPosition));
    const fallbackPortal = { x: 2.04, z: -37.864 };
    await mark(pageB, "portal A");
    const travelA = await portalTravel(pageA, "portal A", PORTAL_LINK_ID, portalPosition || fallbackPortal);
    await mark(pageB, "portal A:end");
    await sleep(1000);
    await mark(pageA, "portal B");
    const travelB = await portalTravel(pageB, "portal B", PORTAL_LINK_ID, portalPosition || fallbackPortal);
    await mark(pageA, "portal B:end");

    await mark(pageB, "grens A");
    // Eerst een stuk van de aankomstportal af, zodat de muis niet op het portalmodel drukt.
    await mark(pageB, "weg van portal");
    await clickMove(pageA, "weg van portal", -8, -8);
    await mark(pageB, "weg van portal:end");
    const zoneBeforeBorder = (await playerState(pageA)).zone;
    // Woestijn (z 250..750) ligt ten noorden van de startzone (z -250..250).
    const borderA = await walkAcrossZoneBorder(pageA, "grens A", { x: 0, z: zoneBeforeBorder === "zone.node02.live_demo" ? 1 : -1 });
    await mark(pageB, "grens A:end");
    console.log("Renderkosten " + await renderCost(pageA, "na grens"));
    const serverPerf = await pageA.evaluate(function () {
      return fetch("/api/game/player", { headers: { Accept: "application/json" } }).then(function (response) { return response.json(); }).then(function (json) { return json.serverPerf || null; });
    });
    // Speler C: route langs het bos in de Test-zone (via de portal Start to Test).
    let forestResult = "overgeslagen";
    let collisionDebug = null;
    if (process.env.GK_FEEL_SKIP_FOREST !== "1") {
      const cookieC = await registerTestPlayer(world.base, "feel_c");
      const pageC = await openGameAs(browser, world.base, cookieC, VIEWPORT);
      await sleep(5000);
      await installRecorder(pageC);
      const testPortal = await pageC.evaluate(function () {
        const found = window.__GK_GAME_CLIENT_DEBUG.getInteractionTargets().find(function (target) { return target.instanceId === "zone_link.object.2"; });
        return found ? { x: found.x, z: found.z } : null;
      });
      const travelC = await portalTravel(pageC, "portal C", "zone_link.object.2", testPortal || { x: 8.958, z: -37.66 });
      if (travelC.ok) {
        await forestRoute(pageC, "bos C", [{ x: 524, z: 74.3 }, { x: 560, z: 92 }, { x: 620, z: 94 }, { x: 690, z: 92 }, { x: 740, z: 84 }, { x: 600, z: 96 }, { x: 530, z: 90 }]);
        // Kevins video 2026-10-24 21:16: langs de punt van de bosgrens (512.6, 86.7) naar de portal; de oude server
        // bleef op (511.3, 83.6) hangen en de speler sprong daarheen terug bij stilstaan.
        await forestRoute(pageC, "bosrand C", [{ x: 506.4, z: 68.6 }, { x: 507.9, z: 73.0 }, { x: 511.3, z: 83.6 }, { x: 526.2, z: 70.8 }, { x: 529.0, z: 64.0 }]);
        collisionDebug = await pageC.evaluate(function () { return window.__GK_GAME_RUNTIME.getCollisionDebug ? window.__GK_GAME_RUNTIME.getCollisionDebug() : null; });
        const feelC = await pageC.evaluate(function () { window.__feel.running = false; return window.__feel; });
        forestResult = analyzeForest(feelC, "bos C") + "\n  " + analyzeForest(feelC, "bosrand C");
        if (process.env.GK_FEEL_OUT) fs.writeFileSync(process.env.GK_FEEL_OUT.replace(/\.json$/, "-c.json"), JSON.stringify(feelC));
      } else {
        forestResult = "portal naar de Test-zone mislukt (" + JSON.stringify(travelC) + ")";
      }
    }
    const feelA = await pageA.evaluate(function () { window.__feel.running = false; return window.__feel; });
    const feelB = await pageB.evaluate(function () { window.__feel.running = false; return window.__feel; });
    if (process.env.GK_FEEL_OUT) fs.writeFileSync(process.env.GK_FEEL_OUT, JSON.stringify({ feelA, feelB, idA, idB }));
    console.log("");
    console.log("== Speler A (lokaal) ==");
    for (const [label] of clicks) console.log("  " + analyzeClick(feelA, label));
    console.log("  " + analyzeKey(feelA, "toets W"));
    console.log("  " + analyzePortal(feelA, "portal A", travelA));
    console.log("  " + analyzeClick(feelA, "weg van portal"));
    console.log("  " + analyzeBorder(feelA, "grens A") + " (" + JSON.stringify(borderA) + ")");
    console.log("== Speler C (bosroute) ==");
    console.log("  " + forestResult);
    console.log("  obstakels voor beweging " + (collisionDebug ? collisionDebug.predictionSolids : "-") + ", actief in de renderer " + (collisionDebug ? collisionDebug.activeSolids : "-"));
    console.log("== Speler B (lokaal) ==");
    console.log("  " + analyzePortal(feelB, "portal B", travelB));
    console.log("== Medespeler-weergave ==");
    for (const [label] of clicks) console.log("  B ziet A, " + analyzeRemote(feelB, label, idA));
    console.log("  B ziet A, " + analyzeRemote(feelB, "portal A", idA));
    console.log("  A ziet B, " + analyzeRemote(feelA, "portal B", idB));
    console.log("  B ziet A, " + analyzeRemote(feelB, "grens A", idA));
    console.log("== Vertraging medespeler (" + (process.env.GK_WORLD_COPY_NETWORK_PRESET || "preset van de wereld") + ") ==");
    for (const label of ["klik 12", "grens A"]) console.log("  B ziet A, " + analyzeRemoteDelay(feelA, feelB, label, idA));
    console.log("== Server ==");
    console.log("  ticks: " + JSON.stringify(serverPerf));
  } finally {
    if (browser) await browser.close().catch(function () {});
    await world.stop();
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
