// Bots in de echte game (Kevin 20-11). Wordt door de server gestart (src/server/bot-manager.js), niet met de hand.
// Elke bot speelt als een gewone speler, met dezelfde berichten als de echte game:
//   - lopen: 20x per seconde player:input_state met looppunt (de server loopt de route na en botst),
//   - vijanden en grondstoffen zien via actor:snapshot, eigen plek via mmo:snapshot,
//   - quests: naar de questgever lopen en aannemen, doelen afwerken (vechten, verzamelen, praten, reizen), inleveren,
//   - zonder quest: vijanden in de buurt verslaan of grondstoffen pakken, anders rondlopen bij de plek waar ze loskwamen.
// Elke 2 s gaat een stand naar de server (kills, quests, verkeer per bot), die de game toont bij Instellingen > Bots.
import WebSocket from "ws";
import { JOIN_TICKET_PATH, PROTOCOL_NAME, PROTOCOL_VERSION, WS_PATH } from "../apps/web/public/shared/protocol-v1.js";

const BASE = String(process.env.GK_BOTS_BASE || "http://127.0.0.1:3001").replace(/\/$/, "");
const ORIGIN = process.env.GK_BOTS_ORIGIN || BASE;
const INPUT_MS = 50;
const THINK_MS = 1000;
const POLL_MS = 8000; // zoals de game: de stand komt vooral mee met het antwoord op een actie
const ATTACK_MS = 1600;
const GATHER_MS = 2500;
const SIGHT_M = 45;
const WANDER_M = 18;
const QUEST_STUCK_MS = 150000;
const STATUS_MS = 2000;

const bots = new Map();
const totals = { kills: 0, questsAccepted: 0, questsDone: 0, gathered: 0, deaths: 0, errors: [] };
const killedAt = new Map(); // vijand-id -> tijd: een vijand die meerdere bots zien sterven telt één keer
let statusAt = Date.now();

function noteError(text) {
  const line = String(text || "fout").slice(0, 160);
  if (totals.errors[totals.errors.length - 1] === line) return;
  totals.errors.push(line);
  if (totals.errors.length > 5) totals.errors.shift();
}

function distance(a, b) {
  return Math.hypot((Number(a.x) || 0) - (Number(b.x) || 0), (Number(a.z) || 0) - (Number(b.z) || 0));
}

function serverSpot(bot) {
  return Number.isFinite(bot.sx) ? { x: bot.sx, z: bot.sz } : { x: bot.x, z: bot.z };
}

function nearest(from, list) {
  let best = null;
  let bestDistance = Infinity;
  for (const entry of list) {
    if (!entry || !Number.isFinite(Number(entry.x)) || !Number.isFinite(Number(entry.z))) continue;
    const d = distance(from, entry);
    if (d < bestDistance) { best = entry; bestDistance = d; }
  }
  return best;
}

async function call(bot, method, pathname, body) {
  const headers = { Origin: ORIGIN, Cookie: bot.cookie, Accept: "application/json" };
  if (method !== "GET") headers["X-GK-CSRF"] = bot.csrf;
  let payload;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const response = await fetch(BASE + pathname, { method, headers, body: payload });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 403) {
    noteError(bot.name + " " + method + " " + pathname + ": " + response.status + " " + (json?.message || ""));
  }
  return { status: response.status, ok: response.status === 200 && json?.ok !== false, json };
}

function operationId(bot) {
  return "bot:" + bot.name + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7);
}

function act03(bot, action, targetId, extra = {}) {
  return call(bot, "POST", "/api/game/node03/action", Object.assign({ action, targetId: targetId || null, operationId: operationId(bot) }, extra));
}

async function act04(bot, action, extra = {}) {
  const result = await call(bot, "POST", "/api/game/node04/action", Object.assign({ action, operationId: operationId(bot) }, extra));
  // Het antwoord bevat de nieuwe queststand: die gebruiken in plaats van opnieuw op te vragen.
  if (result.json?.snapshot?.quests) {
    bot.quest = result.json.snapshot;
    bot.questAt = Date.now();
  }
  return result;
}

function go(bot, target, near, doing, followId = null) {
  bot.goal = { x: Number(target.x), z: Number(target.z), near: Math.max(0.4, near), followId };
  bot.doing = doing;
}

function createBot(info, anchor) {
  return Object.assign({}, info, {
    anchor: { x: Number(anchor?.x) || 0, z: Number(anchor?.z) || 0 },
    ws: null, playerId: null, netId: null, x: 0, z: 0, sx: NaN, sz: NaN, speed: 6, seq: 1,
    clientSessionId: "bot-" + info.name + "-" + Date.now(),
    goal: null, detour: null, dirX: 0, dirZ: 0, wasMoving: false,
    actors: new Map(), quest: null, questAt: 0,
    lastAttackAt: 0, lastHitId: null, lastGatherAt: 0, dead: false,
    blacklist: new Set(), progress: { key: "", at: Date.now() },
    stuck: { x: 0, z: 0, at: Date.now(), tries: 0 },
    downBytes: 0, upMsgs: 0, doing: "start", timers: [], stopped: false, busy: false, placedWaiter: null, reconnects: 0
  });
}

function send(bot, message) {
  if (!bot.ws || bot.ws.readyState !== 1) return;
  bot.ws.send(JSON.stringify(message));
  bot.upMsgs += 1;
}

function setSelf(bot, x, z, teleport) {
  if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(z))) return;
  bot.sx = Number(x);
  bot.sz = Number(z);
  // Zoals de echte game: kleine verschillen haalt de server zelf in; een sprong (teleport, muur) neemt de bot over.
  if (teleport || Math.hypot(bot.x - bot.sx, bot.z - bot.sz) > 5) {
    bot.x = bot.sx;
    bot.z = bot.sz;
  }
}

function onMessage(bot, data) {
  bot.downBytes += data.length;
  let message = null;
  try { message = JSON.parse(String(data)); } catch { return; }
  const type = message?.type;
  if (type === "ping") {
    send(bot, { type: "pong", clientPingSeq: message.clientPingSeq || null, clientSentAt: message.clientSentAt || null });
  } else if (type === "mmo:snapshot") {
    for (const record of Array.isArray(message.players) ? message.players : []) {
      if (record?.playerId && record.playerId === bot.playerId) {
        bot.netId = record.n || bot.netId;
        setSelf(bot, record.x, record.z, false);
      } else if (bot.netId && record?.i === bot.netId) {
        setSelf(bot, record.x, record.z, record.t === 1);
      }
    }
  } else if (type === "actor:snapshot") {
    if (message.full) {
      const keep = new Set((message.actors || []).map((entry) => entry.id));
      for (const id of Array.from(bot.actors.keys())) if (!keep.has(id)) bot.actors.delete(id);
    }
    for (const entry of Array.isArray(message.actors) ? message.actors : []) {
      const before = bot.actors.get(entry.id);
      if (entry.k === "a" && before && before.s !== "d" && entry.s === "d" && bot.lastHitId === entry.id && Date.now() - bot.lastAttackAt < 5000
        && Date.now() - (killedAt.get(entry.id) || 0) > 10000) {
        killedAt.set(entry.id, Date.now());
        totals.kills += 1;
        if (killedAt.size > 2000) killedAt.clear();
      }
      bot.actors.set(entry.id, { id: entry.id, k: entry.k, x: entry.x, z: entry.z, s: entry.s });
    }
    for (const id of Array.isArray(message.gone) ? message.gone : []) bot.actors.delete(id);
  }
}

// 20x per seconde: een stukje lopen naar het doel en dat als looppunt sturen (zoals de game).
function stepMovement(bot) {
  if (!bot.ws || bot.ws.readyState !== 1 || bot.dead) return;
  const now = Date.now();
  if (bot.goal?.followId) {
    const actor = bot.actors.get(bot.goal.followId);
    if (actor) { bot.goal.x = actor.x; bot.goal.z = actor.z; }
  }
  const target = bot.detour && now < bot.detour.until ? bot.detour : bot.goal;
  let moving = false;
  if (target) {
    const dx = target.x - bot.x;
    const dz = target.z - bot.z;
    const d = Math.hypot(dx, dz);
    if (d > target.near) {
      const stride = Math.min(d - target.near * 0.5, bot.speed * INPUT_MS / 1000);
      bot.dirX = dx / d;
      bot.dirZ = dz / d;
      bot.x += bot.dirX * stride;
      bot.z += bot.dirZ * stride;
      moving = true;
    }
  }
  if (moving) {
    send(bot, { type: "player:input_state", payload: { clientSessionId: bot.clientSessionId, inputSeq: bot.seq++, clientSentAt: now, controllerEpoch: 0,
      input: { moveX: Math.round(bot.dirX * 1000) / 1000, moveZ: Math.round(bot.dirZ * 1000) / 1000, pathPoint: { x: Math.round(bot.x * 1000) / 1000, z: Math.round(bot.z * 1000) / 1000 } } } });
  } else if (bot.wasMoving) {
    send(bot, { type: "player:input_state", payload: { clientSessionId: bot.clientSessionId, inputSeq: bot.seq++, clientSentAt: now, controllerEpoch: 0, input: { moveX: 0, moveZ: 0, stop: true } } });
  }
  bot.wasMoving = moving;
}

// Vast tegen een muur of huis: even schuin opzij, en na een paar keer een ander doel.
function checkStuck(bot) {
  const now = Date.now();
  const spot = serverSpot(bot);
  const wantsToMove = bot.goal && distance(spot, bot.goal) > bot.goal.near + 1;
  if (!wantsToMove || distance(spot, bot.stuck) > 0.7) {
    bot.stuck = { x: spot.x, z: spot.z, at: now, tries: wantsToMove ? bot.stuck.tries : 0 };
    return;
  }
  if (now - bot.stuck.at < 3000) return;
  bot.stuck.tries += 1;
  bot.stuck.at = now;
  bot.x = spot.x;
  bot.z = spot.z;
  if (bot.stuck.tries > 4) {
    bot.goal = null;
    bot.stuck.tries = 0;
    return;
  }
  const base = Math.atan2(bot.goal.z - spot.z, bot.goal.x - spot.x);
  const turn = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random() * Math.PI / 3);
  bot.detour = { x: spot.x + Math.cos(base + turn) * 4, z: spot.z + Math.sin(base + turn) * 4, near: 0.5, until: now + 1500 };
}

function fight(bot, range) {
  const spot = serverSpot(bot);
  const enemies = Array.from(bot.actors.values()).filter((actor) => actor.k === "a" && actor.s !== "d" && distance(spot, actor) <= range);
  const enemy = nearest(spot, enemies);
  if (!enemy) return false;
  bot.doing = "vecht";
  if (distance(spot, enemy) > 2.4) {
    go(bot, enemy, 1.6, "vecht", enemy.id);
    return true;
  }
  bot.goal = null;
  const now = Date.now();
  if (now - bot.lastAttackAt >= ATTACK_MS) {
    bot.lastAttackAt = now;
    bot.lastHitId = enemy.id;
    act03(bot, "attack", enemy.id).catch(() => {});
  }
  return true;
}

function gather(bot, range) {
  const spot = serverSpot(bot);
  const resources = Array.from(bot.actors.values()).filter((actor) => actor.k === "r" && actor.s === "i" && distance(spot, actor) <= range);
  const resource = nearest(spot, resources);
  if (!resource) return false;
  if (distance(spot, resource) > 2) {
    go(bot, resource, 1.2, "verzamelt");
    return true;
  }
  bot.goal = null;
  bot.doing = "verzamelt";
  const now = Date.now();
  if (now - bot.lastGatherAt >= GATHER_MS) {
    bot.lastGatherAt = now;
    act03(bot, "gather", resource.id).then((result) => { if (result.ok) totals.gathered += 1; }).catch(() => {});
  }
  return true;
}

function wander(bot, center, radius, doing) {
  if (!bot.goal || distance({ x: bot.x, z: bot.z }, bot.goal) <= bot.goal.near + 0.2) {
    const angle = Math.random() * Math.PI * 2;
    const length = Math.random() * radius;
    go(bot, { x: center.x + Math.cos(angle) * length, z: center.z + Math.sin(angle) * length }, 0.6, doing);
  }
}

async function talk(bot, target) {
  bot.doing = "praat";
  const start = await act04(bot, "start_dialogue", { dialogueId: target.dialogueId, targetId: target.targetId || null });
  let dialogue = start.json?.dialogue || null;
  for (let round = 0; round < 4 && dialogue; round += 1) {
    const choices = Array.isArray(dialogue.choices) ? dialogue.choices : [];
    const choice = choices.find((entry) => /turn_in|complete|accept/.test(String(entry.action || "")) && !String(entry.label || "").includes("🔒"))
      || choices.find((entry) => entry.nextEntryRef) || null;
    if (!choice) break;
    const next = await act04(bot, "choose_dialogue", { dialogueId: dialogue.dialogueId, entryId: dialogue.entryId, choiceId: choice.choiceId });
    if (next.ok && choice.action === "accept_quest") totals.questsAccepted += 1;
    if (next.ok && /turn_in|complete/.test(choice.action)) totals.questsDone += 1;
    dialogue = next.ok ? next.json?.dialogue || null : null;
  }
}

// De quest die de bot nu doet. true = de bot heeft iets te doen gekregen.
async function doQuest(bot) {
  const snap = bot.quest;
  if (!snap?.quests) return false;
  const now = Date.now();
  const spot = serverSpot(bot);
  const tracked = (snap.quests.active || []).find((quest) => !bot.blacklist.has(quest.questId)) || null;
  if (tracked) {
    const step = tracked.activeStep || {};
    const key = tracked.questId + ":" + tracked.status + ":" + tracked.activeStepId + ":" + (step.objectives || []).map((objective) => objective.currentValue).join(",");
    if (bot.progress.key !== key) bot.progress = { key, at: now };
    if (step.broken || now - bot.progress.at > QUEST_STUCK_MS) {
      // Komt niet verder (of de quest is aangepast): laten vallen en iets anders doen.
      bot.blacklist.add(tracked.questId);
      bot.progress = { key: "", at: now };
      if (tracked.canAbandon !== false) await act04(bot, "abandon", { questId: tracked.questId });
      return true;
    }
    if (Array.isArray(step.rewardChoice) && step.rewardChoice.length) {
      const result = await act04(bot, "choose_reward", { questId: tracked.questId, choiceId: String(step.rewardChoice[0].index ?? 0) });
      if (result.ok) totals.questsDone += 1;
      return true;
    }
    const targets = (snap.questTargets || []).filter((target) => !target.questId || target.questId === tracked.questId);
    const target = nearest(spot, targets.filter((entry) => entry.action !== "travel")) || nearest(spot, targets);
    if (step.canTurnIn) {
      const result = await act04(bot, "turn_in", { questId: tracked.questId, targetId: target?.targetId || null });
      if (result.ok) { totals.questsDone += 1; return true; }
    }
    if (step.canReach) {
      const result = await act04(bot, "reach", { questId: tracked.questId, targetId: target?.targetId || null });
      if (result.ok) return true;
    }
    if (target) {
      const reach = Math.max(1.5, (Number(target.range) || 3) - 0.6);
      const away = distance(spot, target);
      if (target.action === "travel") {
        if (away > reach) { go(bot, target, reach * 0.7, "reist"); return true; }
        bot.doing = "reist";
        await call(bot, "POST", "/api/game/travel/zone-link", { linkId: target.instanceId });
        bot.questAt = 0;
        return true;
      }
      if (away > reach + 3) {
        // Onderweg naar het doel: een vijand vlak bij je pak je mee.
        if (fight(bot, 6)) return true;
        go(bot, target, reach * 0.7, "quest");
        return true;
      }
      if (target.action === "node04:start_dialogue" && target.dialogueId) { await talk(bot, target); return true; }
      if (step.complete || tracked.status === "ready_to_turn_in") {
        // Klaar: inleveren gaat meestal via het gesprek met de NPC bij het doel.
        const npc = nearest(spot, (snap.dialogueTargets || []).concat(snap.questGivers || []).filter((entry) => entry.dialogueId && distance(spot, entry) <= 6));
        if (npc) {
          if (distance(spot, npc) > reach) { go(bot, npc, reach * 0.7, "levert in"); return true; }
          await talk(bot, npc);
          return true;
        }
      }
      if (fight(bot, 30) || gather(bot, 30)) return true;
      wander(bot, target, 8, "quest");
      return true;
    }
    if (fight(bot, SIGHT_M) || gather(bot, SIGHT_M)) return true;
    return false;
  }
  const available = (snap.quests.available || []).filter((quest) => !bot.blacklist.has(quest.questId));
  if (!available.length) return false;
  const givers = (snap.questGivers || []).filter((giver) => giver.hasAvailableQuest);
  const giver = nearest(spot, givers);
  if (giver) {
    // Aannemen kan op praatafstand; staat de NPC ingesloten (andere bots, een huis), dan na 20 s toch aannemen.
    const reach = Math.max(1.5, (Number(giver.range) || 3) - 0.6) + 3;
    if (!bot.giverSince) bot.giverSince = now;
    if (distance(spot, giver) > reach && now - bot.giverSince < 20000) { go(bot, giver, reach * 0.5, "naar questgever"); return true; }
  }
  bot.giverSince = 0;
  const quest = available[0];
  bot.doing = "neemt quest aan";
  const result = await act04(bot, "accept_quest", { questId: quest.questId, targetId: giver?.targetId || null });
  if (result.ok) totals.questsAccepted += 1;
  else bot.blacklist.add(quest.questId);
  return true;
}

async function think(bot) {
  if (bot.busy || bot.stopped || !bot.ws || bot.ws.readyState !== 1) return;
  bot.busy = true;
  try {
    const now = Date.now();
    if (now - bot.questAt > POLL_MS) {
      const state = await call(bot, "GET", "/api/game/node04/state");
      if (state.status === 200 && state.json) {
        bot.quest = state.json;
        bot.questAt = now;
        const health = state.json.node03?.stats?.health || {};
        const dead = Number(health.max) > 0 && Number(health.current) <= 0;
        if (dead && !bot.dead) totals.deaths += 1;
        bot.dead = dead;
      }
    }
    if (bot.dead) {
      bot.doing = "respawn";
      bot.goal = null;
      const result = await act03(bot, "respawn", null);
      if (result.ok) { bot.dead = false; bot.questAt = 0; }
      return;
    }
    checkStuck(bot);
    if (await doQuest(bot)) return;
    if (fight(bot, SIGHT_M) || gather(bot, SIGHT_M)) return;
    wander(bot, bot.anchor, WANDER_M, "loopt rond");
  } catch (error) {
    noteError(bot.name + ": " + (error?.message || error));
  } finally {
    bot.busy = false;
  }
}

async function connect(bot) {
  const ticket = await call(bot, "POST", JOIN_TICKET_PATH, {});
  if (ticket.status !== 200 || !ticket.json?.ticket) throw new Error("join-ticket " + ticket.status);
  await new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE.replace(/^http/, "ws") + WS_PATH, PROTOCOL_NAME, { headers: { Cookie: bot.cookie, Origin: ORIGIN } });
    bot.ws = ws;
    let authed = false;
    ws.once("open", () => ws.send(JSON.stringify({ type: "auth", v: PROTOCOL_VERSION, ticket: ticket.json.ticket })));
    ws.on("message", (data) => {
      if (!authed) {
        let first = null;
        try { first = JSON.parse(String(data)); } catch {}
        if (first?.type === "auth_ok") { authed = true; resolve(); }
      }
      onMessage(bot, data);
    });
    ws.once("close", (code) => {
      if (!authed) reject(new Error("socket dicht " + code));
      else if (!bot.stopped) {
        noteError(bot.name + ": verbinding dicht (" + code + "), opnieuw");
        if (bot.reconnects < 5) {
          bot.reconnects += 1;
          setTimeout(() => { if (!bot.stopped) connect(bot).catch((error) => noteError(bot.name + ": " + error.message)); }, 3000);
        }
      }
    });
    ws.once("error", (error) => { if (!authed) reject(error); });
  });
}

async function startBot(bot) {
  // Nog geen character: een willekeurige klasse en uiterlijk kiezen (zoals een nieuwe speler).
  const characters = await call(bot, "GET", "/api/game/characters");
  const classes = Array.isArray(characters.json?.classes) ? characters.json.classes : [];
  if (classes.length && !classes.some((entry) => entry.character)) {
    const entry = classes[Math.floor(Math.random() * classes.length)];
    const models = Array.isArray(entry.models) ? entry.models : [];
    const body = { classId: entry.classId };
    if (models.length) body.modelAssetId = models[Math.floor(Math.random() * models.length)];
    await call(bot, "POST", "/api/game/characters/play", body);
  }
  const player = await call(bot, "GET", "/api/game/player");
  if (player.status !== 200) throw new Error("speler laden " + player.status);
  bot.playerId = player.json?.playerId || player.json?.player?.id || player.json?.position?.playerId || null;
  bot.x = Number(player.json?.position?.x) || 0;
  bot.z = Number(player.json?.position?.z) || 0;
  bot.speed = Math.max(1, Number(player.json?.gameWorld?.player?.moveSpeed) || 6);
  await connect(bot);
  // De server zet de bot naast de admin; wachten tot dat gebeurd is, anders loopt hij terug naar zijn oude plek.
  const placed = await new Promise((resolve) => {
    bot.placedWaiter = resolve;
    process.send?.({ type: "connected", userId: bot.userId });
    setTimeout(() => resolve(null), 4000);
  });
  bot.placedWaiter = null;
  if (placed && Number.isFinite(placed.x)) {
    bot.x = placed.x; bot.z = placed.z; bot.sx = placed.x; bot.sz = placed.z;
  }
  if (placed?.anchor) bot.anchor = { x: Number(placed.anchor.x) || bot.x, z: Number(placed.anchor.z) || bot.z };
  bot.timers.push(setInterval(() => stepMovement(bot), INPUT_MS));
  bot.timers.push(setInterval(() => think(bot), THINK_MS + Math.round(Math.random() * 300)));
  let pingSeq = 1;
  bot.timers.push(setInterval(() => send(bot, { type: "ping", clientPingSeq: pingSeq++, clientSentAt: Date.now() }), 2000));
  bot.doing = "loopt rond";
}

// Een drukke server verwerkt het join-ticket soms te laat (dicht met 4401): even wachten en opnieuw.
function startWithRetry(bot, attempt) {
  if (bot.stopped) return;
  startBot(bot).catch((error) => {
    if (bot.stopped) return;
    try { bot.ws?.close(); } catch {}
    if (attempt < 4) {
      bot.doing = "opnieuw verbinden";
      setTimeout(() => startWithRetry(bot, attempt + 1), 2000 * attempt + Math.random() * 1000);
      return;
    }
    noteError(bot.name + " start: " + (error?.message || error));
    bot.doing = "fout";
  });
}

function stopBot(bot) {
  bot.stopped = true;
  for (const timer of bot.timers) clearInterval(timer);
  bot.timers = [];
  try { bot.ws?.close(1000, "bots_stop"); } catch {}
}

function reportStatus() {
  const now = Date.now();
  const seconds = Math.max(0.5, (now - statusAt) / 1000);
  statusAt = now;
  const live = Array.from(bots.values()).filter((bot) => bot.ws && bot.ws.readyState === 1);
  const down = live.map((bot) => bot.downBytes / 1024 / seconds);
  const up = live.map((bot) => bot.upMsgs / seconds);
  const doing = {};
  for (const bot of bots.values()) {
    doing[bot.doing] = (doing[bot.doing] || 0) + 1;
    bot.downBytes = 0;
    bot.upMsgs = 0;
  }
  const average = (list) => list.length ? Math.round(list.reduce((sum, value) => sum + value, 0) / list.length * 10) / 10 : null;
  process.send?.({
    type: "status",
    connected: live.length,
    kills: totals.kills,
    questsAccepted: totals.questsAccepted,
    questsDone: totals.questsDone,
    gathered: totals.gathered,
    deaths: totals.deaths,
    doing,
    downKbPerBot: average(down),
    downKbPerBotMax: down.length ? Math.round(Math.max(...down) * 10) / 10 : null,
    upMsgsPerBot: average(up),
    errors: totals.errors.slice()
  });
}

function stopAll() {
  for (const bot of bots.values()) stopBot(bot);
  bots.clear();
}

process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type === "add") {
    (message.bots || []).forEach((info, index) => {
      if (bots.has(info.userId)) return;
      const bot = createBot(info, message.anchor);
      bots.set(info.userId, bot);
      // Niet allemaal tegelijk: elke 150 ms een bot erbij.
      setTimeout(() => startWithRetry(bot, 1), index * 150);
    });
  } else if (message.type === "placed") {
    const bot = bots.get(message.userId);
    if (bot?.placedWaiter) bot.placedWaiter(message);
  } else if (message.type === "stop") {
    stopAll();
    setTimeout(() => process.exit(0), 500);
  }
});

process.on("disconnect", () => {
  stopAll();
  process.exit(0);
});

setInterval(reportStatus, STATUS_MS);
