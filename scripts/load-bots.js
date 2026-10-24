// F2-E3-T03 / F2-E2-T04: botladder en meting van tick, eventloop en DB-schrijfkosten.
//
// Draait standaard op een eigen GEISOLEERDE server (tijdelijke DB, nooit de live DB):
//   GK_TEST_ISOLATED=1 node scripts/load-bots.js --users=25 --minutes=30
//   GK_TEST_ISOLATED=1 node scripts/load-bots.js --ladder=1,10,25 --minutes=2      (DB-schrijfkosten per stap)
// Opties:
//   --users=N          aantal bots (standaard 25)
//   --ladder=1,10,25   meerdere stappen na elkaar (overschrijft --users)
//   --minutes=M        duur per stap (standaard 30)
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
import { applyFoundation, createStartZone, createTestWorldApi } from "./lib/test-world.js";
import { JOIN_TICKET_PATH, PROTOCOL_NAME, PROTOCOL_VERSION, WS_PATH } from "../apps/web/public/shared/protocol-v1.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, "").split("=");
  return [key, rest.length ? rest.join("=") : "1"];
}));
const LADDER = String(args.ladder || args.users || "25").split(",").map((n) => Math.max(1, Number(n) || 1));
const MINUTES = Math.max(0.1, Number(args.minutes || 30));
const OUT_DIR = path.resolve(rootDir, args.out || "README/fases/evidence/MMORPG-v2/F2");
const ADMIN_USERNAME = "bots-admin";
const ADMIN_PASSWORD = "bots-admin-" + Math.random().toString(36).slice(2) + "-Aa1!";
const GATES = { tickP95: 25, tickP99: 40, eventLoopP99: 20 };

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

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE + "/api/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Server werd niet gezond binnen " + timeoutMs + " ms");
}

async function buildWorld(admin) {
  const login = await admin.call("POST", "/api/auth/login", { username: ADMIN_USERNAME, password: ADMIN_PASSWORD });
  if (login.status !== 200) throw new Error("Admin login mislukt: " + login.status);
  const world = createTestWorldApi((method, pathname, body) => admin.call(method, pathname, body));
  const foundation = await applyFoundation(world);
  await createStartZone(world, foundation, { zoneId: "zone.bots", displayName: "Bot Zone", spawn: { x: 0, z: 0 } });
  const publish = await admin.call("POST", "/api/editor/publish");
  if (publish.status !== 200) throw new Error("Publiceren mislukt: " + publish.status + " " + publish.text.slice(0, 200));
}

function startBot(index, stats) {
  const http = client();
  const bot = { index, http, ws: null, seq: 1, angle: Math.random() * Math.PI * 2, stopped: false, timers: [] };
  bot.start = async function () {
    const name = "bot" + index + "_" + Math.random().toString(36).slice(2, 7);
    const reg = await http.call("POST", "/api/auth/register", { identifier: name, password: "Bot-" + name + "-Aa1!" });
    if (reg.status !== 201) throw new Error("Registreren mislukt (" + name + "): " + reg.status + " " + reg.text.slice(0, 120));
    await http.call("GET", "/api/game/player");
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
      });
      ws.once("close", (code) => {
        if (!bot.stopped) stats.unexpectedCloses.push({ bot: index, code });
        reject(new Error("socket dicht: " + code));
      });
      ws.once("error", reject);
    });
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
    bot.timers.push(setInterval(async () => {
      try {
        const state = await http.call("GET", "/api/game/node03/state");
        const target = (state.json?.interactionTargets || []).find((t) => t && t.action === "attack" && t.inRange);
        if (!target) return;
        const result = await http.call("POST", "/api/game/node03/action", {
          action: "attack",
          targetId: target.instanceId,
          operationId: "bot:" + index + ":" + Date.now()
        });
        stats.attacks += 1;
        if (result.status !== 200) stats.attackErrors[result.status] = (stats.attackErrors[result.status] || 0) + 1;
      } catch {}
    }, 1500 + Math.random() * 1000));
  };
  bot.stop = function () {
    bot.stopped = true;
    for (const timer of bot.timers) clearInterval(timer);
    try { bot.ws?.close(1000, "done"); } catch {}
  };
  return bot;
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

async function runStep(users, admin, databasePath) {
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
  const samples = [];
  const durationMs = MINUTES * 60 * 1000;
  const startedAt = Date.now();
  console.log("[bots] " + users + " bots verbonden (" + stats.startErrors.length + " fouten), " + MINUTES + " min");
  while (Date.now() - startedAt < durationMs) {
    await new Promise((resolve) => setTimeout(resolve, Math.min(10000, durationMs)));
    const perf = (await admin.call("GET", "/api/game/player")).json?.serverPerf || null;
    if (perf) samples.push({ atMs: Date.now() - startedAt, perf });
  }
  for (const bot of bots) bot.stop();
  const last = samples[samples.length - 1]?.perf || null;
  const tick = last?.clock?.tickDurationMs || {};
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
  return { users, minutes: MINUTES, stats, gates, receipts, finalPerf: last, samples };
}

async function main() {
  let server = null;
  let runtime = null;
  let databasePath = null;
  const admin = client();
  try {
    if (!BASE) {
      requireIsolatedMode();
      runtime = await createIsolatedRuntime(rootDir, "load-bots");
      databasePath = runtime.databasePath;
      BASE = "http://127.0.0.1:" + runtime.port;
      server = spawn(process.execPath, ["src/server/server.js"], {
        cwd: rootDir,
        env: runtime.env({ ADMIN_USERNAME, ADMIN_PASSWORD }),
        stdio: ["ignore", "ignore", "pipe"]
      });
      server.stderr.on("data", (data) => process.stderr.write("[server] " + data));
      await waitForHealth(90000);
      await buildWorld(admin);
    } else {
      console.log("[bots] tegen bestaande server " + BASE + " (geen DB-duplicaatcheck)");
      const reg = await admin.call("POST", "/api/auth/register", { identifier: "bots_observer_" + Date.now(), password: "Observer-Aa1!-" + Date.now() });
      if (reg.status !== 201) throw new Error("Observer registreren mislukt: " + reg.status);
    }
    const steps = [];
    for (const users of LADDER) steps.push(await runStep(users, admin, databasePath));
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
        console.log("[bots] " + step.users + " bots  " + mark + "  " + name + " = " + gate.value + " (max " + gate.max + ")");
      }
      console.log("[bots] " + step.users + " bots  DB-writes ms: " + JSON.stringify(step.finalPerf?.dbWritesMs || {}));
    }
    console.log(allOk ? "[bots] GO: alle gates gehaald" : "[bots] NO-GO: minstens een gate niet gehaald");
    process.exitCode = allOk ? 0 : 1;
  } finally {
    if (server) server.kill("SIGTERM");
    if (runtime) runtime.cleanup();
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
