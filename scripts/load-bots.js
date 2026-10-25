// F2-E3-T03 / F2-E2-T04: botladder en meting van tick, eventloop en DB-schrijfkosten.
//
// Draait standaard op een eigen GEISOLEERDE server (tijdelijke DB, nooit de live DB):
//   GK_TEST_ISOLATED=1 node scripts/load-bots.js --users=25 --minutes=30
//   GK_TEST_ISOLATED=1 node scripts/load-bots.js --ladder=1,10,25 --minutes=2      (DB-schrijfkosten per stap)
// Opties:
//   --users=N          aantal bots (standaard 25)
//   --ladder=1,10,25   meerdere stappen na elkaar (overschrijft --users)
//   --minutes=M        duur per stap (standaard 30)
//   --crash-after-min=M kill + herstelproef na M minuten (alleen geïsoleerd, één stap)
//   --warmup-sec=S     opwarmtijd na verbinden, daarna schoon meetvenster (standaard 15)
//   --out=PAD          map voor het rapport (standaard README/fases/evidence/MMORPG-v2/F2/)
//   --base=URL         tegen een al draaiende server (alleen met Kevins akkoord; maakt echte accounts aan)
// Elke bot: registreert, haalt een join-ticket, verbindt via /ws/game (gk-mmo-v1), loopt rond met
// input_state op ~30 Hz en valt node03-vijanden in bereik aan (als de wereld die heeft).
// Gates (fase 02): tick p95 <= 25 ms, p99 <= 40 ms, eventloop p99 <= 20 ms, 0 dubbele receipts.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import WebSocket from "ws";
import { createIsolatedRuntime, requireIsolatedMode } from "./lib/test-isolation.js";
import { addGoldenPathSlice, applyFoundation, createStartZone, createTestWorldApi } from "./lib/test-world.js";
import { JOIN_TICKET_PATH, PROTOCOL_NAME, PROTOCOL_VERSION, WS_PATH } from "../apps/web/public/shared/protocol-v1.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : "1"];
}));
const LADDER = String(args.ladder || args.users || "25").split(",").map((n) => Math.max(1, Number(n) || 1));
const MINUTES = Math.max(0.1, Number(args.minutes || 30));
const CRASH_AFTER_MIN = args["crash-after-min"] === undefined ? null : Number(args["crash-after-min"]);
const OUT_DIR = path.resolve(rootDir, args.out || "README/fases/evidence/MMORPG-v2/F2");
const ADMIN_USERNAME = "bots-admin";
const ADMIN_PASSWORD = "bots-admin-" + Math.random().toString(36).slice(2) + "-Aa1!";
const GATES = { tickP95: 25, tickP99: 40, eventLoopP99: 20 };
const POSITION_RPO_MAX_MS = 5000;
const WARMUP_MS = Math.max(0, Number(args["warmup-sec"] ?? 15) * 1000);

let BASE = args.base ? String(args.base).replace(/\/$/, "") : null;

function client() {
  let cookie = null;
  let csrfToken = null;
  return {
    get cookie() { return cookie; },
    async call(method, pathname, body) {
      const headers = { Origin: BASE };
      if (cookie) headers.Cookie = cookie;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && csrfToken) headers["X-GK-CSRF"] = csrfToken;
      let payload;
      if (body !== undefined && body !== null) {
        headers["Content-Type"] = "application/json";
        payload = JSON.stringify(body);
      }
      const response = await fetch(BASE + pathname, { method, headers, body: payload });
      const raw = response.headers.get("set-cookie");
      if (raw) cookie = raw.split(";")[0];
      const text = await response.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = null; }
      if (json?.csrfToken) csrfToken = json.csrfToken;
      return { status: response.status, json, text };
    }
  };
}

async function waitForHealth(timeoutMs, child = null) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error("Server stopte voor /api/health (code=" + child.exitCode + ", signal=" + child.signalCode + ")");
    }
    try {
      const response = await fetch(BASE + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server werd niet gezond binnen " + timeoutMs + " ms");
}

function spawnIsolatedServer(runtime) {
  const env = runtime.env({ ADMIN_USERNAME, ADMIN_PASSWORD });
  const baseUrl = new URL(BASE);
  if (baseUrl.hostname !== env.HOST || baseUrl.port !== env.PORT) {
    throw new Error("Geïsoleerde serverconfiguratie wijkt af: BASE=" + BASE + ", HOST=" + env.HOST + ", PORT=" + env.PORT);
  }
  console.log("[bots] geïsoleerde server: BASE=" + BASE + " HOST=" + env.HOST + " PORT=" + env.PORT);
  const child = spawn(process.execPath, ["src/server/server.js"], {
    cwd: rootDir,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (data) => process.stdout.write("[server:stdout] " + data));
  child.stderr.on("data", (data) => process.stderr.write("[server:stderr] " + data));
  return child;
}

async function waitForExit(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve, reject) => {
    child.once("exit", resolve);
    child.once("error", reject);
  });
}

async function resetPerfWindow(admin) {
  try {
    const result = await admin.call("POST", "/api/game/perf/reset", {});
    if (result.status === 200) return { ok: true, at: result.json?.perfWindowStartedAt || null };
    console.log("[bots] let op: meetvenster resetten mislukt (" + result.status + "); eventloop telt dan ook het opstarten mee");
    return { ok: false, status: result.status };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

async function buildWorld(admin) {
  const login = await admin.call("POST", "/api/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (login.status !== 200) throw new Error("Admin login mislukt: " + login.status);
  const world = createTestWorldApi((method, pathname, body) => admin.call(method, pathname, body));
  const foundation = await applyFoundation(world);
  const zone = await createStartZone(world, foundation, { zoneId: "zone.bots", displayName: "Bot Zone", spawn: { x: 0, z: 0 } });
  await addGoldenPathSlice(world, foundation, zone, { prefix: "f2_bots" });
  const publish = await admin.call("POST", "/api/editor/publish");
  if (publish.status !== 200) throw new Error("Publiceren mislukt: " + publish.status + " " + publish.text.slice(0, 200));
}

function startBot(index, stats) {
  const http = client();
  const bot = {
    index,
    http,
    ws: null,
    seq: 1,
    actionSeq: 1,
    angle: Math.random() * Math.PI * 2,
    stopped: false,
    timers: [],
    playerId: null,
    ackedOperations: [],
    pendingAttacks: new Set(),
    expectedSockets: new WeakSet()
  };
  bot.tryAttack = function () {
    const pending = (async () => {
      try {
        const state = await http.call("GET", "/api/game/node03/state");
        const target = (state.json?.interactionTargets || []).find((t) => t && t.action === "attack" && t.inRange);
        if (!target) return;
        const operationId = "bot:" + index + ":" + Date.now() + ":" + bot.actionSeq++;
        const result = await http.call("POST", "/api/game/node03/action", {
          action: "attack",
          targetId: target.instanceId,
          operationId
        });
        stats.attacks += 1;
        if (result.status === 200) {
          bot.ackedOperations.push({
            operationId,
            ackedAt: new Date().toISOString(),
            grants: Array.isArray(result.json?.grants) ? result.json.grants : []
          });
        } else {
          stats.attackErrors[result.status] = (stats.attackErrors[result.status] || 0) + 1;
        }
      } catch {}
    })();
    bot.pendingAttacks.add(pending);
    pending.finally(() => bot.pendingAttacks.delete(pending));
    return pending;
  };
  bot.connect = async function () {
    bot.stopped = false;
    const ticket = await http.call("POST", JOIN_TICKET_PATH, {});
    if (ticket.status !== 200 || !ticket.json?.ticket) throw new Error("Join-ticket mislukt: " + ticket.status);
    const wsUrl = BASE.replace(/^http/, "ws") + WS_PATH;
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, PROTOCOL_NAME, { headers: { Cookie: http.cookie, Origin: BASE } });
      bot.ws = ws;
      ws.once("open", () => ws.send(JSON.stringify({ type: "auth", v: PROTOCOL_VERSION, ticket: ticket.json.ticket })));
      ws.on("message", (data) => {
        stats.messages += 1;
        stats.bytes += data.length;
        let message = null;
        try { message = JSON.parse(String(data)); } catch {}
        if (message?.type === "auth_ok") resolve();
        // Zoals de echte client: server-ping direct beantwoorden, anders sluit de server na 30 s (4000 heartbeat).
        if (message?.type === "ping" && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "pong", clientPingSeq: message.clientPingSeq || null, clientSentAt: message.clientSentAt || null }));
        }
      });
      ws.once("close", (code) => {
        if (!bot.stopped && !bot.expectedSockets.has(ws)) stats.unexpectedCloses.push({ bot: index, code, at: new Date().toISOString() });
        reject(new Error("socket dicht: " + code));
      });
      ws.once("error", reject);
    });
    await bot.tryAttack();
    const clientSessionId = "bot-" + index + "-" + Date.now();
    bot.timers.push(setInterval(() => {
      if (!bot.ws || bot.ws.readyState !== 1) return;
      bot.angle += (Math.random() - 0.5) * 0.6;
      const pause = Math.random() < 0.05;
      bot.ws.send(JSON.stringify({
        type: "player:input_state",
        payload: {
          clientSessionId,
          inputSeq: bot.seq++,
          clientSentAt: Date.now(),
          controllerEpoch: 0,
          input: { moveX: pause ? 0 : Math.cos(bot.angle), moveZ: pause ? 0 : Math.sin(bot.angle), sprint: false, pointerTarget: null, stop: pause }
        }
      }));
      stats.inputs += 1;
    }, 33));
    bot.timers.push(setInterval(() => bot.tryAttack(), 1500 + Math.random() * 1000));
    // Zoals de echte client (CLIENT_PING_INTERVAL_MS = 2000): zelf pingen houdt de heartbeat vers.
    let pingSeq = 1;
    bot.timers.push(setInterval(() => {
      if (!bot.ws || bot.ws.readyState !== 1) return;
      bot.ws.send(JSON.stringify({ type: "ping", clientPingSeq: pingSeq++, clientSentAt: Date.now() }));
    }, 2000));
  };
  bot.start = async function () {
    const name = "bot" + index + "_" + Math.random().toString(36).slice(2, 7);
    const reg = await http.call("POST", "/api/auth/register", { identifier: name, password: "Bot-" + name + "-Aa1!" });
    if (reg.status !== 201) throw new Error("Registreren mislukt (" + name + "): " + reg.status + " " + reg.text.slice(0, 120));
    const player = await http.call("GET", "/api/game/player");
    bot.playerId = player.json?.playerId || player.json?.player?.id || null;
    if (player.status !== 200 || !bot.playerId) throw new Error("Player-id ophalen mislukt: " + player.status);
    await bot.connect();
  };
  bot.stop = function (closeSocket = true) {
    bot.stopped = true;
    for (const timer of bot.timers) clearInterval(timer);
    bot.timers = [];
    if (bot.ws) bot.expectedSockets.add(bot.ws);
    if (closeSocket) {
      try { bot.ws?.close(1000, "done"); } catch {}
    }
  };
  return bot;
}

function ackedBeforeCrash(bots) {
  return bots.map((bot) => ({
    bot: bot.index,
    playerId: bot.playerId,
    operations: bot.ackedOperations.map((operation) => ({
      operationId: operation.operationId,
      ackedAt: operation.ackedAt,
      grants: operation.grants
    }))
  }));
}

function inspectCrashDatabase(databasePath, botEvidence, killAtMs) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const missingOrIncomplete = [];
    const rewards = [];
    const positions = [];
    for (const bot of botEvidence) {
      for (const operation of bot.operations) {
        const row = db.prepare("SELECT player_id, status, result_json, completed_at FROM operation_idempotency WHERE operation_id = ? LIMIT 1")
          .get(operation.operationId);
        if (!row || row.status !== "completed" || row.player_id !== bot.playerId) {
          missingOrIncomplete.push({ operationId: operation.operationId, playerId: bot.playerId, found: row || null });
        }
        if (operation.grants.length) {
          const ledgerRows = db.prepare(`
            SELECT id, operation_id, player_id, asset_kind, asset_id, delta_real, before_real, after_real, reason, source_ref
            FROM economy_ledger WHERE operation_id = ? AND player_id = ? AND delta_real > 0 ORDER BY id
          `).all(operation.operationId, bot.playerId);
          rewards.push({ operationId: operation.operationId, playerId: bot.playerId, grants: operation.grants, ledgerRows });
        }
      }
      const row = db.prepare("SELECT updated_at, world_id, revision FROM player_positions WHERE player_id = ? ORDER BY updated_at DESC LIMIT 1")
        .get(bot.playerId);
      const updatedAtMs = Date.parse(row?.updated_at || "");
      positions.push({
        bot: bot.bot,
        playerId: bot.playerId,
        updatedAt: row?.updated_at || null,
        worldId: row?.world_id || null,
        revision: row?.revision ?? null,
        rpoMs: Number.isFinite(updatedAtMs) ? Math.max(0, killAtMs - updatedAtMs) : null
      });
    }
    return {
      readOnly: true,
      positionMeasure: {
        column: "player_positions.updated_at",
        explanation: "mmo-service vernieuwt updated_at bij elke bewegings-tick; de positiecheckpointer schrijft die actuele timestamp buiten de tick elke seconde weg (hard maximum 5 s)."
      },
      acknowledgedCount: botEvidence.reduce((total, bot) => total + bot.operations.length, 0),
      missingOrIncomplete,
      positions,
      rewards
    };
  } finally {
    db.close();
  }
}

function currentRewardValue(db, reward) {
  if (reward.asset_kind === "item_stack") {
    return db.prepare("SELECT COALESCE(SUM(quantity), 0) AS value FROM player_inventory_stacks WHERE player_id = ? AND item_id = ?")
      .get(reward.player_id, reward.asset_id).value;
  }
  if (reward.asset_kind === "item_instance") {
    return db.prepare("SELECT COUNT(*) AS value FROM player_item_instances WHERE player_id = ? AND item_id = ? AND location_type <> 'deleted'")
      .get(reward.player_id, reward.asset_id).value;
  }
  if (reward.asset_kind === "currency") {
    return db.prepare("SELECT amount_minor AS value FROM player_currencies WHERE player_id = ? AND currency_id = ?")
      .get(reward.player_id, reward.asset_id)?.value ?? 0;
  }
  if (reward.asset_kind === "xp") {
    return db.prepare("SELECT xp AS value FROM player_progression WHERE player_id = ?")
      .get(reward.player_id)?.value ?? 0;
  }
  if (reward.asset_kind === "ability") {
    return db.prepare("SELECT COUNT(*) AS value FROM player_abilities WHERE player_id = ? AND ability_id = ?")
      .get(reward.player_id, reward.asset_id).value;
  }
  if (reward.asset_kind === "stat") {
    return db.prepare("SELECT current_value AS value FROM player_stats WHERE player_id = ? AND stat_id = ?")
      .get(reward.player_id, reward.asset_id)?.value ?? null;
  }
  return null;
}

async function verifyRestart(databasePath, bots, crashInspection) {
  const stateFailures = [];
  for (const bot of bots) {
    const state = await bot.http.call("GET", "/api/game/node03/state");
    if (state.status !== 200 || state.json?.playerId !== bot.playerId) {
      stateFailures.push({ bot: bot.index, playerId: bot.playerId, status: state.status });
    }
  }
  const missingLedgerRows = [];
  const missingRewardState = [];
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    for (const rewardOperation of crashInspection.rewards) {
      if (!rewardOperation.ledgerRows.length) {
        missingLedgerRows.push({ operationId: rewardOperation.operationId, reason: "ACK bevat grants maar geen positieve ledgerregel" });
      }
      for (const reward of rewardOperation.ledgerRows) {
        const persisted = db.prepare("SELECT id FROM economy_ledger WHERE id = ? AND operation_id = ? AND player_id = ? LIMIT 1")
          .get(reward.id, reward.operation_id, reward.player_id);
        if (!persisted) missingLedgerRows.push({ operationId: reward.operation_id, ledgerId: reward.id });
        const current = currentRewardValue(db, reward);
        if (!Number.isFinite(Number(current)) || Number(current) < Number(reward.after_real)) {
          missingRewardState.push({
            operationId: reward.operation_id,
            playerId: reward.player_id,
            assetKind: reward.asset_kind,
            assetId: reward.asset_id,
            expectedAtLeast: reward.after_real,
            current
          });
        }
      }
    }
  } finally {
    db.close();
  }
  const rewardOperations = crashInspection.rewards.length;
  return {
    health: true,
    playerStatesChecked: bots.length,
    rewardOperations,
    stateFailures,
    missingLedgerRows,
    missingRewardState,
    ok: rewardOperations > 0 && stateFailures.length === 0 && missingLedgerRows.length === 0 && missingRewardState.length === 0
  };
}

async function performCrash({ controller, bots, databasePath }) {
  for (const bot of bots) bot.stop(false);
  const signalSentAtMs = Date.now();
  const killed = controller.current?.kill("SIGKILL") === true;
  if (!killed) throw new Error("SIGKILL kon niet naar de geïsoleerde server worden gestuurd");
  await waitForExit(controller.current);
  const killAtMs = Date.now();
  await Promise.allSettled(bots.flatMap((bot) => Array.from(bot.pendingAttacks)));
  const evidence = ackedBeforeCrash(bots);
  const inspection = inspectCrashDatabase(databasePath, evidence, killAtMs);
  let restart;
  try {
    controller.current = spawnIsolatedServer(controller.runtime);
    await waitForHealth(90000, controller.current);
    restart = await verifyRestart(databasePath, bots, inspection);
  } catch (error) {
    restart = { health: false, ok: false, error: String(error?.message || error) };
  }
  const reconnectErrors = [];
  if (restart.health) {
    for (const bot of bots) {
      try {
        await bot.connect();
      } catch (error) {
        reconnectErrors.push({ bot: bot.index, error: String(error?.message || error) });
      }
    }
  }
  const maxRpoMs = inspection.positions.reduce((max, row) => Number.isFinite(row.rpoMs) ? Math.max(max, row.rpoMs) : Infinity, 0);
  return {
    configuredAfterMinutes: CRASH_AFTER_MIN,
    signal: "SIGKILL",
    signalSentAt: new Date(signalSentAtMs).toISOString(),
    killAt: new Date(killAtMs).toISOString(),
    evidence,
    inspection,
    restart,
    reconnectErrors,
    gates: {
      lostAcknowledgedOperations: { value: inspection.missingOrIncomplete.length, max: 0, ok: inspection.missingOrIncomplete.length === 0 },
      positionRpoMs: { value: Number.isFinite(maxRpoMs) ? maxRpoMs : null, max: POSITION_RPO_MAX_MS, ok: Number.isFinite(maxRpoMs) && maxRpoMs <= POSITION_RPO_MAX_MS },
      restartOk: { value: restart.ok === true, required: true, ok: restart.ok === true },
      allBotsReconnected: { value: bots.length - reconnectErrors.length, required: bots.length, ok: reconnectErrors.length === 0 }
    }
  };
}

function duplicateReceiptCheck(databasePath) {
  if (!databasePath || !fs.existsSync(databasePath)) return { checked: false };
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const ledgerDupes = db.prepare(`
      SELECT operation_id, asset_id, reason, COUNT(*) AS n FROM economy_ledger
      GROUP BY operation_id, asset_id, reason, source_ref HAVING COUNT(*) > 1
    `).all();
    const unfinished = db.prepare("SELECT COUNT(*) AS n FROM operation_idempotency WHERE status <> 'completed'").get().n;
    return { checked: true, duplicateLedgerRows: ledgerDupes.length, unfinishedOperations: unfinished, examples: ledgerDupes.slice(0, 5) };
  } finally {
    db.close();
  }
}

async function runStep(users, admin, databasePath, crashController = null) {
  const stats = { users, messages: 0, bytes: 0, inputs: 0, attacks: 0, attackErrors: {}, unexpectedCloses: [], startErrors: [] };
  const bots = [];
  for (let i = 0; i < users; i++) {
    const bot = startBot(i, stats);
    bots.push(bot);
    try {
      await bot.start();
    } catch (error) {
      stats.startErrors.push(String(error.message || error));
    }
  }
  // Opwarmen, daarna een schoon meetvenster: opstarten, wereldbouw en registraties (wachtwoord-hash)
  // tellen dan niet mee in eventloop en DB-writes. Tick-p95/p99 komen uit een eigen ringbuffer.
  await new Promise((resolve) => setTimeout(resolve, WARMUP_MS));
  const perfReset = await resetPerfWindow(admin);
  const samples = [];
  const durationMs = MINUTES * 60 * 1000;
  const crashAtMs = CRASH_AFTER_MIN === null ? null : CRASH_AFTER_MIN * 60 * 1000;
  const startedAt = Date.now();
  let crash = null;
  console.log("[bots] " + users + " bots verbonden (" + stats.startErrors.length + " fouten), " + MINUTES + " min");
  while (Date.now() - startedAt < durationMs) {
    const elapsed = Date.now() - startedAt;
    const untilEnd = durationMs - elapsed;
    const untilCrash = crashAtMs === null || crash ? Infinity : crashAtMs - elapsed;
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(10000, untilEnd, untilCrash))));
    if (crashAtMs !== null && !crash && Date.now() - startedAt >= crashAtMs) {
      console.log("[bots] SIGKILL na " + CRASH_AFTER_MIN + " min; DB-controle en herstart");
      crash = await performCrash({ controller: crashController, bots, databasePath });
      if (!crash.restart.health) break;
      // Herstart telt niet als belasting: na opwarmen opnieuw een schoon meetvenster.
      await new Promise((resolve) => setTimeout(resolve, WARMUP_MS));
      crash.perfResetAfterRestart = await resetPerfWindow(admin);
      continue;
    }
    const perf = (await admin.call("GET", "/api/game/player")).json?.serverPerf || null;
    if (perf) samples.push({ atMs: Date.now() - startedAt, perf });
  }
  for (const bot of bots) bot.stop();
  const last = samples[samples.length - 1]?.perf || null;
  // Tick: slechtste p95/p99 van alle tussenmetingen (de ringbuffer dekt alleen de laatste ~minuut).
  const worst = (key) => samples.reduce((max, sample) => {
    const value = sample.perf?.clock?.tickDurationMs?.[key];
    return Number.isFinite(value) ? Math.max(max ?? value, value) : max;
  }, null);
  const tick = { p95: worst("p95"), p99: worst("p99") };
  const loop = last?.eventLoopDelayMs || {};
  const receipts = duplicateReceiptCheck(databasePath);
  const gates = {
    tickP95: { value: tick.p95 ?? null, max: GATES.tickP95, ok: Number.isFinite(tick.p95) && tick.p95 <= GATES.tickP95 },
    tickP99: { value: tick.p99 ?? null, max: GATES.tickP99, ok: Number.isFinite(tick.p99) && tick.p99 <= GATES.tickP99 },
    eventLoopP99: { value: loop.p99 ?? null, max: GATES.eventLoopP99, ok: Number.isFinite(loop.p99) && loop.p99 <= GATES.eventLoopP99 },
    duplicateReceipts: { value: receipts.duplicateLedgerRows ?? null, max: 0, ok: receipts.checked ? receipts.duplicateLedgerRows === 0 : null },
    allBotsConnected: { value: users - stats.startErrors.length, max: users, ok: stats.startErrors.length === 0 },
    noUnexpectedCloses: { value: stats.unexpectedCloses.length, max: 0, ok: stats.unexpectedCloses.length === 0 }
  };
  if (crash) Object.assign(gates, crash.gates);
  return { users, minutes: MINUTES, warmupMs: WARMUP_MS, perfReset, stats, gates, receipts, crash, finalPerf: last, samples };
}

async function main() {
  let server = null;
  let runtime = null;
  let databasePath = null;
  const admin = client();
  try {
    if (CRASH_AFTER_MIN !== null) {
      if (BASE) throw new Error("--crash-after-min werkt alleen in geïsoleerde modus (zonder --base)");
      if (!Number.isFinite(CRASH_AFTER_MIN) || CRASH_AFTER_MIN <= 0 || CRASH_AFTER_MIN >= MINUTES) {
        throw new Error("--crash-after-min moet groter dan 0 en kleiner dan --minutes zijn");
      }
      if (LADDER.length !== 1) throw new Error("--crash-after-min ondersteunt precies één botstap");
    }
    if (!BASE) {
      requireIsolatedMode();
      runtime = await createIsolatedRuntime(rootDir, "load-bots");
      databasePath = runtime.databasePath;
      BASE = "http://" + runtime.host + ":" + runtime.port;
      server = spawnIsolatedServer(runtime);
      await waitForHealth(90000, server);
      await buildWorld(admin);
    } else {
      console.log("[bots] tegen bestaande server " + BASE + " (geen DB-duplicaatcheck)");
      const reg = await admin.call("POST", "/api/auth/register", { identifier: "bots_observer_" + Date.now(), password: "Observer-Aa1!-" + Date.now() });
      if (reg.status !== 201) throw new Error("Observer registreren mislukt: " + reg.status);
    }
    const steps = [];
    const crashController = runtime ? { runtime, get current() { return server; }, set current(value) { server = value; } } : null;
    for (const users of LADDER) steps.push(await runStep(users, admin, databasePath, crashController));
    const report = {
      createdAt: new Date().toISOString(),
      host: { hostname: os.hostname(), cpus: os.cpus().map((cpu) => cpu.model)[0], cpuCount: os.cpus().length, totalMemMb: Math.round(os.totalmem() / 1048576), platform: process.platform, node: process.version },
      target: runtime ? "isolated" : BASE,
      gates: GATES,
      steps
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, "bots-" + LADDER.join("-") + "x" + MINUTES + "min-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
    fs.writeFileSync(file, JSON.stringify(report, null, 2));
    console.log("[bots] rapport: " + path.relative(rootDir, file));
    let allOk = true;
    for (const step of steps) {
      for (const [name, gate] of Object.entries(step.gates)) {
        const mark = gate.ok === true ? "ok  " : gate.ok === null ? "n.v.t." : "FOUT";
        if (gate.ok === false) allOk = false;
        const expectation = gate.max !== undefined ? "max " + gate.max : "vereist " + gate.required;
        console.log("[bots] " + step.users + " bots  " + mark + "  " + name + " = " + gate.value + " (" + expectation + ")");
      }
      console.log("[bots] " + step.users + " bots  DB-writes ms: " + JSON.stringify(step.finalPerf?.dbWritesMs || {}));
    }
    console.log(allOk ? "[bots] GO: alle gates gehaald" : "[bots] NO-GO: minstens een gate niet gehaald");
    process.exitCode = allOk ? 0 : 1;
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await waitForExit(server).catch(() => {});
    }
    if (runtime) runtime.cleanup();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
