// Bots in de echte game (Kevin 20-11). Wordt door de server gestart (src/server/bot-manager.js), niet met de hand.
// Elke bot speelt als een gewone speler, met dezelfde berichten als de echte game:
//   - lopen: 20x per seconde player:input_state met looppunt (de server loopt de route na en botst),
//   - vijanden en grondstoffen zien via actor:snapshot, eigen plek via mmo:snapshot,
//   - quests: naar de questgever lopen en aannemen, doelen afwerken (vechten, verzamelen, praten, reizen), inleveren,
//   - zonder quest: vijanden in de buurt verslaan of grondstoffen pakken, anders rondlopen bij de plek waar ze loskwamen.
// Elke 2 s gaat een stand naar de server (kills, quests, verkeer per bot), die de game toont bij Instellingen > Bots.
// Kevin 21-11: bots zoeken hun route zelf met dezelfde routezoeker als de game (over bruggen en wegen), en van een bot
// die met "+1 met logboek" is losgelaten schrijven we elke beslissing op (map bot-logs naast de database).
// Kevin 21-11 (brug met vlag): bots lopen met dezelfde loopkaart als de server voor die speler (een loopvlak of botsing met
// "Alleen als vlag" telt alleen als de vlag voor de bot klopt). Kan de bot niet bij het doel van een quest (geen route, of
// steeds vast), dan zet hij die quest even opzij en doet hij een andere (bijv. eerst hout naar de smid, dan is de brug er).
// Verandert een vlag, dan probeert hij de opzij gezette quests meteen opnieuw. Werkt voor elk soort doel: verslaan,
// verzamelen, inleveren, praten, gebied, reizen; onbekende doelen: erheen lopen en in de buurt bezig zijn.
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";
import { JOIN_TICKET_PATH, PROTOCOL_NAME, PROTOCOL_VERSION, WS_PATH } from "../apps/web/public/shared/protocol-v1.js";
import { createPlayerNavigator } from "../apps/web/public/shared/player-navigation.js";
import { walkabilityForFlags } from "../apps/web/public/shared/movement-kernel.js";

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
const LOG_DIR = process.env.GK_BOTS_LOG_DIR || "";
const ROUTE_MIN_M = 6;
const PARK_MS = 120000; // quest waar de bot niet bij kan: zo lang opzij (of tot een vlag verandert)
const UNREACHABLE_MS = 60000; // plek of ding zonder route: zo lang niet opnieuw proberen
const TALK_MS = 8000;

let navWorld = null;
const navigators = new Map();
let tracedBot = null;

const bots = new Map();
const totals = { kills: 0, questsAccepted: 0, questsDone: 0, gathered: 0, deaths: 0, errors: [] };
const killedAt = new Map(); // vijand-id -> tijd: een vijand die meerdere bots zien sterven telt één keer
let statusAt = Date.now();

// Zoals de server (world-flags.js passes): gate = { id | flagId, on }.
function flagPasses(on, gate) {
  const id = gate?.flagId || gate?.id;
  if (!id) return true;
  return on.has(String(id)) === (gate.on !== false);
}

// De loopkaart van deze bot: zonder de loopvlakken (brug) en botsingen die er door vlaggen voor hem niet zijn.
function navigatorFor(bot) {
  if (!navWorld?.index) return null;
  const key = Math.round(bot.radius * 100) + "|" + (navWorld.flagged ? bot.flagKey : "");
  let nav = navigators.get(key);
  if (!nav) {
    const passes = (gate) => flagPasses(bot.flagsOn, gate);
    const index = navWorld.flagged ? walkabilityForFlags(navWorld.index, passes, navWorld.flagCache) : navWorld.index;
    const solids = navWorld.flagged ? navWorld.solids.filter((solid) => !solid?.flag || passes(solid.flag)) : navWorld.solids;
    if (navigators.size > 40) navigators.clear();
    nav = createPlayerNavigator({ index, solids, radius: bot.radius });
    navigators.set(key, nav);
  }
  return nav;
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

// Logboek van één bot: elke regel met tijd sinds hij loskwam; ook naar een bestand voor de CLI.
function trace(bot, kind, text) {
  if (!bot?.traced) return;
  const seconds = Math.round((Date.now() - bot.tracedAt) / 1000);
  const line = String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0") + " " + kind + ": " + text;
  bot.traceLines.push(line);
  if (bot.traceLines.length > 40) bot.traceLines.shift();
  if (bot.traceFile) {
    try { fs.appendFileSync(bot.traceFile, line + "\n"); } catch {}
  }
}

function questLine(bot) {
  const snap = bot.quest;
  const parked = Array.from(bot.parked.keys()).filter((id) => isParked(bot, id));
  const aside = parked.length ? " · opzij: " + parked.join(", ") : "";
  const quest = (snap?.quests?.active || []).find((entry) => entry.questId === bot.questId) || null;
  if (!quest) return "geen quest bezig (" + (snap?.quests?.active || []).length + " actief, " + (snap?.quests?.available || []).length + " te halen)" + aside;
  const step = quest.activeStep || {};
  const goals = (step.objectives || []).map((objective) => (objective.objectiveType || "?") + " " + objective.currentValue + "/" + objective.requiredValue).join(", ");
  return quest.questId + " [" + quest.status + "] stap " + (step.displayName || quest.activeStepId || "?") + (goals ? " (" + goals + ")" : "")
    + (step.canTurnIn ? " kan inleveren" : "") + (step.canReach ? " kan praten" : "") + (step.complete ? " klaar" : "") + aside;
}

// Nieuwe queststand (van een poll of het antwoord op een actie). Andere vlaggen = andere wereld voor deze bot.
function setQuest(bot, snap) {
  bot.quest = snap;
  bot.questAt = Date.now();
  if (bot.traced && !bot.questsTraced && snap?.quests) {
    // Eén keer: alle quests van deze bot met hun stand (verlaten/al gedaan tellen ook), zodat je ziet wat hij kan doen.
    bot.questsTraced = true;
    const list = (snap.quests.all || []).map((quest) => quest.questId + " " + quest.status + (quest.abandoned ? " verlaten" : "") + (quest.doneBefore ? " al gedaan" : "")
      + (quest.canRepeat ? " herhaalbaar" : "") + " (" + (quest.startMode || "npc") + ")");
    trace(bot, "quests", list.length ? list.join(" · ") : "geen");
    trace(bot, "vlag", "aan voor mij: " + ((snap.world?.flags || []).join(", ") || "geen") + (snap.world?.hidden?.length ? " · verborgen: " + snap.world.hidden.length : "")
      + " · startgebieden: " + (snap.startAreas || []).length);
  }
  if (!snap?.world) return;
  const flags = (Array.isArray(snap.world.flags) ? snap.world.flags : []).map(String).sort();
  const key = flags.join("|");
  if (key === bot.flagKey) return;
  bot.flagsOn = new Set(flags);
  bot.flagKey = key;
  trace(bot, "vlag", flags.length ? "aan voor mij: " + flags.join(", ") : "geen vlag aan");
  // Bijv. de brug is er nu: opzij gezette quests en onbereikbare plekken meteen opnieuw proberen.
  bot.parked.clear();
  bot.unreachable.clear();
  bot.badSpots = [];
  bot.giveUps.clear();
  if (bot.goal) planRoute(bot);
}

function isParked(bot, questId) {
  const until = bot.parked.get(questId);
  if (!until) return false;
  if (Date.now() < until) return true;
  bot.parked.delete(questId);
  return false;
}

function parkQuest(bot, questId, why, ms = PARK_MS) {
  if (!questId) return;
  bot.parked.set(questId, Date.now() + ms);
  bot.giveUps.delete(questId);
  bot.goal = null;
  bot.progress = { key: "", at: Date.now() };
  trace(bot, "quest", questId + " even opzij (" + Math.round(ms / 1000) + " s of tot een vlag verandert): " + why);
}

function blocked(bot, key) {
  return Boolean(key) && Date.now() < (bot.unreachable.get(key) || 0);
}

// Een plek zonder route: alles binnen 6 m daarvan ook even overslaan (zoeken naar "geen route" kost het meest).
function badSpot(bot, point) {
  const now = Date.now();
  return bot.badSpots.some((spot) => spot.until > now && Math.hypot(spot.x - Number(point.x), spot.z - Number(point.z)) < 6);
}

function markUnreachable(bot, key, point = null) {
  const until = Date.now() + UNREACHABLE_MS;
  if (key) {
    if (bot.unreachable.size > 300) bot.unreachable.clear();
    bot.unreachable.set(key, until);
  }
  if (point && Number.isFinite(Number(point.x))) {
    bot.badSpots = bot.badSpots.filter((spot) => spot.until > Date.now()).slice(-60);
    bot.badSpots.push({ x: Number(point.x), z: Number(point.z), until });
  }
}

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
  // Een aanval in cooldown (429) is normaal; niet als fout tellen.
  const cooldown = response.status === 429 && pathname.endsWith("/node03/action");
  if (!cooldown && (response.status >= 500 || response.status === 429 || response.status === 401 || response.status === 403)) {
    noteError(bot.name + " " + method + " " + pathname + ": " + response.status + " " + (json?.message || ""));
  }
  const result = { status: response.status, ok: response.status === 200 && json?.ok !== false, json };
  if (bot.traced && method !== "GET" && !cooldown) {
    trace(bot, "actie", (body?.action || pathname) + (body?.questId ? " " + body.questId : "") + (body?.targetId ? " doel " + body.targetId : "")
      + " -> " + response.status + (json?.message ? " " + String(json.message).slice(0, 120) : ""));
  }
  return result;
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
  if (result.json?.snapshot?.quests) setQuest(bot, result.json.snapshot);
  return result;
}

// false = daar kan de bot niet komen (geen route op zijn loopkaart); key onthoudt dat even (ding of plek).
function go(bot, target, near, doing, followId = null, key = null) {
  const x = Number(target.x);
  const z = Number(target.z);
  const spotKey = key || "p:" + Math.round(x) + "," + Math.round(z);
  if (blocked(bot, spotKey) || badSpot(bot, { x, z })) return false;
  const same = bot.goal && Math.hypot(bot.goal.x - x, bot.goal.z - z) < 2.5;
  bot.goal = { x, z, near: Math.max(0.4, near), followId, key: spotKey, route: same ? bot.goal.route : null, routeTried: same ? bot.goal.routeTried : false,
    reachable: same ? bot.goal.reachable : true, why: doing };
  if (bot.doing !== doing) trace(bot, "doel", doing + " -> (" + round1(x) + ", " + round1(z) + "), " + round1(distance(serverSpot(bot), bot.goal)) + " m");
  bot.doing = doing;
  if (!bot.goal.routeTried) planRoute(bot);
  if (bot.goal.reachable === false) {
    markUnreachable(bot, spotKey, { x, z });
    bot.goal = null;
    return false;
  }
  return true;
}

// Route zoeken zoals de game van een speler doet (zelfde routezoeker, via wegen en bruggen). Geen kaart of geen route:
// recht op het doel af, en bij vastlopen opzij (zie checkStuck).
function planRoute(bot) {
  const goal = bot.goal;
  if (!goal) return;
  goal.routeTried = true;
  goal.route = null;
  goal.reachable = true;
  const from = serverSpot(bot);
  if (distance(from, goal) < ROUTE_MIN_M) return;
  const nav = navigatorFor(bot);
  if (!nav) { trace(bot, "route", "geen loopkaart, rechtdoor"); return; }
  bot.routeBudget -= 1;
  const started = Date.now();
  let result = null;
  try {
    result = nav.findPath({ x: from.x, y: 0, z: from.z }, { x: goal.x, z: goal.z }, { maxExpanded: 16000, maxChecks: 60000, roads: true, arrivalRadius: goal.near });
  } catch (error) {
    result = { ok: false, reason: error?.message || "fout" };
  }
  const ms = Date.now() - started;
  if (result?.ok && Array.isArray(result.points) && result.points.length) {
    goal.route = result.points.map((point) => ({ x: Number(point.x), z: Number(point.z) }));
    bot.x = from.x;
    bot.z = from.z;
    trace(bot, "route", goal.route.length + " punten, " + ms + " ms" + (result.viaRoad || result.road ? ", via de weg" : ""));
  } else if (result?.reason === "no_path" || result?.reason === "goal_blocked") {
    // Op zijn loopkaart is er geen weg (bijv. de brug is er voor hem nog niet).
    goal.reachable = false;
    trace(bot, "route", "kan er niet komen (" + result.reason + ", " + ms + " ms)");
  } else {
    trace(bot, "route", "geen route (" + (result?.reason || "?") + ", " + ms + " ms), rechtdoor");
  }
}

function createBot(info, anchor) {
  return Object.assign({}, info, {
    anchor: { x: Number(anchor?.x) || 0, z: Number(anchor?.z) || 0 },
    ws: null, playerId: null, netId: null, x: 0, z: 0, sx: NaN, sz: NaN, speed: 6, seq: 1,
    clientSessionId: "bot-" + info.name + "-" + Date.now(),
    goal: null, detour: null, dirX: 0, dirZ: 0, wasMoving: false,
    actors: new Map(), quest: null, questAt: 0,
    lastAttackAt: 0, lastHitId: null, lastGatherAt: 0, dead: false, attackWait: 0, radius: 0.5, takenAt: new Map(),
    traced: info.trace === true, tracedAt: Date.now(), traceLines: [], traceFile: "", lastTraceKey: "", lastTraceAt: 0,
    blacklist: new Set(), progress: { key: "", at: Date.now() },
    flagsOn: new Set(), flagKey: "", badSpots: [], routeBudget: 2, questsTraced: false, parked: new Map(), unreachable: new Map(), giveUps: new Map(), talkedAt: new Map(), stalls: new Map(), questId: null,
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
  const goal = bot.goal;
  if (goal?.followId) {
    const actor = bot.actors.get(goal.followId);
    if (actor) {
      goal.x = actor.x;
      goal.z = actor.z;
      // De vijand loopt weg van het eind van de route: dan recht erop af.
      const end = goal.route?.[goal.route.length - 1];
      if (end && Math.hypot(end.x - goal.x, end.z - goal.z) > 4) goal.route = null;
    }
  }
  let target = goal;
  if (goal?.route?.length) {
    while (goal.route.length && Math.hypot(goal.route[0].x - bot.x, goal.route[0].z - bot.z) < 0.6) goal.route.shift();
    if (goal.route.length) target = { x: goal.route[0].x, z: goal.route[0].z, near: goal.route.length === 1 ? goal.near : 0.3 };
  }
  if (bot.detour && now < bot.detour.until) target = bot.detour;
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
  trace(bot, "vast", "staat 3 s stil op (" + round1(spot.x) + ", " + round1(spot.z) + "), doel " + round1(distance(spot, bot.goal)) + " m (" + (bot.goal.why || bot.doing) + "), poging " + bot.stuck.tries
    + (bot.goal.route ? ", route nog " + bot.goal.route.length + " punten" : ", geen route"));
  if (bot.stuck.tries > 4) {
    trace(bot, "vast", "doel opgegeven na 4 pogingen");
    markUnreachable(bot, bot.goal.key, bot.goal);
    // Twee keer vast op weg naar het doel van de quest: die quest even opzij en iets anders doen.
    if (bot.questId && /^(quest|levert in|reist)/.test(bot.goal.why || "")) {
      const count = (bot.giveUps.get(bot.questId) || 0) + 1;
      bot.giveUps.set(bot.questId, count);
      if (count >= 2) parkQuest(bot, bot.questId, "steeds vast onderweg");
    }
    bot.goal = null;
    bot.stuck.tries = 0;
    return;
  }
  // Eerst opnieuw een route zoeken vanaf waar de server hem ziet; daarna opzij stappen.
  if (bot.stuck.tries === 1) {
    planRoute(bot);
    if (bot.goal?.route?.length) return;
  }
  const base = Math.atan2(bot.goal.z - spot.z, bot.goal.x - spot.x);
  const turn = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random() * Math.PI / 3);
  bot.detour = { x: spot.x + Math.cos(base + turn) * 4, z: spot.z + Math.sin(base + turn) * 4, near: 0.5, until: now + 1500 };
  bot.goal.routeTried = false;
  trace(bot, "vast", "stap opzij naar (" + round1(bot.detour.x) + ", " + round1(bot.detour.z) + ")");
}

// Dichtstbijzijnde eerst; waar geen route heen is (andere kant van het water) slaat de bot over.
function byDistance(spot, list, score = null) {
  return list.filter((entry) => Number.isFinite(Number(entry?.x)) && Number.isFinite(Number(entry?.z)))
    .map((entry) => ({ entry, d: score ? score(entry) : distance(spot, entry) }))
    .sort((a, b) => a.d - b.d).map((item) => item.entry);
}

function fight(bot, range) {
  const spot = serverSpot(bot);
  const enemies = Array.from(bot.actors.values()).filter((actor) => actor.k === "a" && actor.s !== "d" && distance(spot, actor) <= range && !blocked(bot, "t:" + actor.id) && !badSpot(bot, actor));
  let enemy = null;
  for (const candidate of byDistance(spot, enemies).slice(0, 3)) {
    if (distance(spot, candidate) <= 2.4) { enemy = candidate; break; }
    if (bot.routeBudget <= 0) break; // routes zoeken kost tijd voor alle bots: volgende ronde verder
    if (go(bot, candidate, 1.6, "vecht", candidate.id, "t:" + candidate.id)) return true;
  }
  if (!enemy) return false;
  bot.goal = null;
  bot.doing = "vecht";
  const now = Date.now();
  // Zoals de game: niet sneller slaan dan de cooldown; bij "nog in cooldown" (429) iets langer wachten.
  if (now - bot.lastAttackAt >= ATTACK_MS + bot.attackWait) {
    bot.lastAttackAt = now;
    bot.lastHitId = enemy.id;
    act03(bot, "attack", enemy.id).then((result) => {
      if (result.status === 429) bot.attackWait = Math.min(2500, bot.attackWait + 400);
      else if (result.ok) bot.attackWait = Math.max(0, bot.attackWait - 100);
    }).catch(() => {});
  }
  return true;
}

// Grondstoffen (actor:snapshot) en spullen op de grond (pickups, zoals "Wood" voor een verzamel-quest).
// wanted = open questdoelen: wat daar bij naam in voorkomt (bijv. "Wood") gaat voor.
function gather(bot, range, wanted = null) {
  const spot = serverSpot(bot);
  const now = Date.now();
  const fresh = (id) => now - (bot.takenAt.get(id) || 0) > 30000 && !blocked(bot, "t:" + id);
  const near = (thing) => distance(spot, thing) <= range && !badSpot(bot, thing);
  const named = new Map();
  for (const target of bot.quest?.node03?.interactionTargets || []) if (target?.instanceId) named.set(target.instanceId, target);
  const resources = Array.from(bot.actors.values())
    .filter((actor) => actor.k === "r" && actor.s === "i" && fresh(actor.id) && near(actor))
    .map((actor) => ({ id: actor.id, x: actor.x, z: actor.z, action: "gather", name: named.get(actor.id)?.displayName || "" }));
  const pickups = Array.from(named.values())
    .filter((target) => target.action === "pickup" && target.available !== false && fresh(target.instanceId) && near(target))
    .map((target) => ({ id: target.instanceId, x: Number(target.x), z: Number(target.z), action: "pickup", name: target.displayName || "" }));
  const words = (wanted || []).map((objective) => [objective.displayName, objective.message, objective.itemRef, objective.resourceRef].filter(Boolean).join(" ")).join(" ").toLowerCase();
  const score = (thing) => distance(spot, thing) - (words && thing.name && words.includes(String(thing.name).toLowerCase()) ? 25 : 0);
  let thing = null;
  for (const candidate of byDistance(spot, resources.concat(pickups), score).slice(0, 3)) {
    const doing = candidate.action === "pickup" ? "pakt op" : "verzamelt";
    if (distance(spot, candidate) <= 2) { thing = candidate; break; }
    if (bot.routeBudget <= 0) break;
    if (go(bot, candidate, 1.2, doing, null, "t:" + candidate.id)) return true;
  }
  if (!thing) return false;
  const doing = thing.action === "pickup" ? "pakt op" : "verzamelt";
  bot.goal = null;
  bot.doing = doing;
  if (now - bot.lastGatherAt >= GATHER_MS) {
    bot.lastGatherAt = now;
    act03(bot, thing.action, thing.id).then((result) => {
      if (result.ok) {
        totals.gathered += 1;
        bot.takenAt.set(thing.id, Date.now());
        // Queststand (verzamel 0/3 -> 1/3) zo snel mogelijk opnieuw ophalen.
        bot.questAt = Math.min(bot.questAt, Date.now() - POLL_MS + 1500);
      } else if (result.status >= 400) {
        bot.takenAt.set(thing.id, Date.now());
      }
    }).catch(() => {});
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
  bot.talkedAt.set(target.dialogueId, Date.now());
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

function canTalk(bot, target) {
  return Boolean(target?.dialogueId) && Date.now() - (bot.talkedAt.get(target.dialogueId) || 0) > TALK_MS;
}

// Zoeken: rondlopen, steeds verder van de plek waar de bot loskwam zolang de quest niet opschiet.
function explore(bot, doing) {
  const radius = Math.min(60, WANDER_M + (Date.now() - bot.progress.at) / 1000 * 0.3);
  wander(bot, bot.anchor, radius, doing);
}

// Quests: welke de bot doet. Kan hij niet bij het doel, dan die quest even opzij en een andere (of een nieuwe aannemen).
// true = de bot heeft iets te doen gekregen.
async function doQuest(bot) {
  const snap = bot.quest;
  if (!snap?.quests) return false;
  const usable = (quest) => Boolean(quest) && !bot.blacklist.has(quest.questId) && !isParked(bot, quest.questId);
  const all = snap.quests.active || [];
  const active = all.filter(usable);
  // De server geeft alleen doelen voor de gevolgde quest: staat die opzij, dan een andere volgen.
  const serverTracked = all.find((quest) => quest.questId === snap.trackedQuest?.questId) || all.find((quest) => quest.tracked) || all[0] || null;
  const tracked = usable(serverTracked) ? serverTracked : active[0] || null;
  if (tracked && serverTracked && tracked.questId !== serverTracked.questId) {
    trace(bot, "quest", "volgt nu " + tracked.questId + " (" + (tracked.displayName || "") + ")");
    const result = await act04(bot, "track", { questId: tracked.questId });
    if (!result.ok) parkQuest(bot, tracked.questId, "volgen lukt niet");
    return true;
  }
  if (bot.questId !== (tracked?.questId || null)) {
    bot.questId = tracked?.questId || null;
    if (tracked) trace(bot, "quest", "bezig met " + tracked.questId + " (" + (tracked.displayName || "") + ")");
  }
  if (tracked) return workOnQuest(bot, tracked, snap);
  return takeQuest(bot, snap, usable);
}

async function workOnQuest(bot, tracked, snap) {
  const now = Date.now();
  const spot = serverSpot(bot);
  const step = tracked.activeStep || {};
  const key = tracked.questId + ":" + tracked.status + ":" + tracked.activeStepId + ":" + (step.objectives || []).map((objective) => objective.currentValue).join(",");
  if (bot.progress.key !== key) bot.progress = { key, at: now };
  if (step.broken) {
    // Quest is aangepast sinds het aannemen: verlaten (dan opnieuw aannemen).
    if (tracked.canAbandon !== false) await act04(bot, "abandon", { questId: tracked.questId });
    parkQuest(bot, tracked.questId, "quest is aangepast", 30000);
    return true;
  }
  if (now - bot.progress.at > QUEST_STUCK_MS) {
    // Schiet niet op: eerst opzij; na twee keer verlaten en niet meer doen.
    const stalls = (bot.stalls.get(tracked.questId) || 0) + 1;
    bot.stalls.set(tracked.questId, stalls);
    if (stalls >= 3) {
      bot.blacklist.add(tracked.questId);
      trace(bot, "quest", tracked.questId + " opgegeven (schiet niet op)");
      if (tracked.canAbandon !== false) await act04(bot, "abandon", { questId: tracked.questId });
      bot.progress = { key: "", at: now };
    } else {
      parkQuest(bot, tracked.questId, "schiet " + Math.round(QUEST_STUCK_MS / 1000) + " s niet op", PARK_MS * stalls);
    }
    return true;
  }
  if (Array.isArray(step.rewardChoice) && step.rewardChoice.length) {
    const result = await act04(bot, "choose_reward", { questId: tracked.questId, choiceId: String(step.rewardChoice[0].index ?? 0) });
    if (result.ok) totals.questsDone += 1;
    return true;
  }
  const open = (step.objectives || []).filter((objective) => !objective.complete && objective.needed !== false);
  const kills = open.some((objective) => objective.objectiveType === "defeat");
  // Spullen nodig: verzamelen, of inleveren terwijl je ze nog niet hebt (dan eerst zoeken, pas daarna naar de NPC).
  const needItems = open.filter((objective) => objective.objectiveType === "collect" || objective.objectiveType === "gather" || (objective.objectiveType === "deliver" && !objective.ready));
  const deliverFirst = open.some((objective) => objective.objectiveType === "deliver" && !objective.ready) && !open.some((objective) => objective.objectiveType === "deliver" && objective.ready);
  const busyNear = (range) => (needItems.length && !kills ? gather(bot, range, needItems) || fight(bot, range) : fight(bot, range) || gather(bot, range, needItems));
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
  if (deliverFirst && target?.action !== "travel") {
    const need = needItems.map((objective) => objective.message || objective.itemRef || objective.objectiveType).join(", ");
    if (bot.lastNeed !== need) { bot.lastNeed = need; trace(bot, "quest", "eerst spullen halen: " + need); }
    if (busyNear(SIGHT_M)) return true;
    explore(bot, "zoekt spullen");
    return true;
  }
  if (target) {
    const reach = Math.max(1.5, (Number(target.range) || 3) - 0.6);
    const away = distance(spot, target);
    const name = target.displayName || target.instanceId;
    if (bot.traced && bot.lastTargetId !== target.instanceId) {
      bot.lastTargetId = target.instanceId;
      trace(bot, "questdoel", name + " [" + target.action + "] op (" + round1(target.x) + ", " + round1(target.z) + "), " + round1(away) + " m");
    }
    const targetKey = "q:" + tracked.questId + ":" + target.instanceId;
    if (target.action === "travel") {
      if (away > reach) {
        if (!go(bot, target, reach * 0.7, "reist", null, targetKey)) parkQuest(bot, tracked.questId, "kan niet bij " + name);
        return true;
      }
      bot.doing = "reist";
      await call(bot, "POST", "/api/game/travel/zone-link", { linkId: target.instanceId });
      bot.questAt = 0;
      return true;
    }
    if (away > reach + 3) {
      // Onderweg naar het doel: een vijand vlak bij je pak je mee.
      if (fight(bot, 6)) return true;
      if (!go(bot, target, reach * 0.7, "quest", null, targetKey)) parkQuest(bot, tracked.questId, "kan niet bij " + name);
      return true;
    }
    // Bij het doel: de stand sneller opvragen (gebied in, plek bereikt).
    bot.questAt = Math.min(bot.questAt, now - POLL_MS + 2500);
    if (target.action === "node04:start_dialogue" && canTalk(bot, target)) { await talk(bot, target); return true; }
    if (step.complete || tracked.status === "ready_to_turn_in") {
      // Klaar: inleveren gaat meestal via het gesprek met de NPC bij het doel.
      const npc = nearest(spot, (snap.dialogueTargets || []).concat(snap.questGivers || []).filter((entry) => entry.dialogueId && distance(spot, entry) <= 6));
      if (npc && canTalk(bot, npc)) {
        if (distance(spot, npc) > reach) { go(bot, npc, reach * 0.7, "levert in"); return true; }
        await talk(bot, npc);
        return true;
      }
    }
    if (busyNear(30)) return true;
    wander(bot, target, 8, "quest");
    return true;
  }
  // Geen plek bij het doel: in de buurt bezig zijn, anders de ster op de kaart, het zoekgebied, of verder zoeken.
  if (busyNear(SIGHT_M)) return true;
  const mark = byDistance(spot, Array.isArray(step.marks) ? step.marks : []).find((entry) => !blocked(bot, "m:" + entry.id));
  if (mark && go(bot, mark, 2, "quest ster", null, "m:" + mark.id)) return true;
  const area = step.map?.center;
  if (area && Number.isFinite(Number(area.x))) {
    const radius = Math.max(3, Number(step.map.radius) || 8);
    if (distance(spot, area) > radius && go(bot, area, radius * 0.5, "quest gebied", null, "g:" + tracked.questId)) return true;
    if (distance(spot, area) <= radius) { wander(bot, area, radius, "quest gebied"); return true; }
  }
  if (needItems.length || kills) { explore(bot, "zoekt"); return true; }
  return false;
}

// Geen quest bezig: een quest aannemen. Ook een verlaten quest (de NPC biedt hem weer aan) of een herhaalbare telt;
// nieuwe eerst. Niets bij een gever: een startgebied in lopen (dan start de quest vanzelf).
async function takeQuest(bot, snap, usable) {
  const now = Date.now();
  const spot = serverSpot(bot);
  const rank = (quest) => (quest.doneBefore ? 2 : quest.abandoned ? 1 : 0);
  const open = (snap.quests.all || snap.quests.available || [])
    .filter((quest) => quest.status === "available" && (!quest.doneBefore || quest.canRepeat) && quest.startMode !== "area" && quest.startMode !== "world" && usable(quest))
    .sort((a, b) => rank(a) - rank(b));
  if (!open.length) return walkIntoStartArea(bot, snap, usable);
  const quest = open[0];
  const givers = (snap.questGivers || []).filter((giver) => (giver.hasAvailableQuest || giver.targetId === quest.giverTargetId) && !blocked(bot, "g:" + giver.instanceId) && !badSpot(bot, giver));
  const giver = givers.find((entry) => quest.giverTargetId && entry.targetId === quest.giverTargetId) || nearest(spot, givers);
  if (giver) {
    // Aannemen kan op praatafstand; staat de NPC ingesloten (andere bots, een huis), dan na 20 s toch aannemen.
    const reach = Math.max(1.5, (Number(giver.range) || 3) - 0.6) + 3;
    if (!bot.giverSince) bot.giverSince = now;
    if (distance(spot, giver) > reach && now - bot.giverSince < 20000) {
      if (!go(bot, giver, reach * 0.5, "naar questgever", null, "g:" + giver.instanceId)) {
        trace(bot, "quest", "kan niet bij questgever " + (giver.displayName || giver.instanceId));
        bot.giverSince = 0;
      }
      return true;
    }
  }
  bot.giverSince = 0;
  bot.doing = "neemt quest aan";
  const result = await act04(bot, "accept_quest", { questId: quest.questId, targetId: giver?.targetId || quest.giverTargetId || null });
  if (result.ok) {
    totals.questsAccepted += 1;
    trace(bot, "quest", "aangenomen: " + quest.questId + (quest.abandoned ? " (was verlaten)" : quest.doneBefore ? " (nog een keer)" : ""));
  } else if (result.status === 404) bot.blacklist.add(quest.questId);
  else parkQuest(bot, quest.questId, "aannemen lukt niet (" + result.status + ")");
  return true;
}

function centerOf(points) {
  let x = 0;
  let z = 0;
  for (const point of points) { x += Number(point.x) || 0; z += Number(point.z) || 0; }
  return { x: x / points.length, z: z / points.length };
}

function walkIntoStartArea(bot, snap, usable) {
  const spot = serverSpot(bot);
  const areas = (snap.startAreas || []).filter((area) => Array.isArray(area.points) && area.points.length >= 3 && usable({ questId: area.questId }))
    .map((area) => Object.assign({ questId: area.questId, areaId: area.areaId }, centerOf(area.points)))
    .filter((area) => !blocked(bot, "s:" + area.areaId) && !badSpot(bot, area));
  const area = nearest(spot, areas);
  if (!area) return false;
  if (distance(spot, area) > 2) {
    if (!go(bot, area, 1.5, "naar startgebied", null, "s:" + area.areaId)) parkQuest(bot, area.questId, "kan niet bij het startgebied");
    return true;
  }
  // Erin: meteen de stand opvragen (zoals de game), dan start de quest.
  bot.questAt = 0;
  markUnreachable(bot, "s:" + area.areaId);
  return true;
}

async function think(bot) {
  if (bot.busy || bot.stopped || !bot.ws || bot.ws.readyState !== 1) return;
  bot.busy = true;
  bot.routeBudget = 2;
  try {
    const now = Date.now();
    if (now - bot.questAt > POLL_MS) {
      const state = await call(bot, "GET", "/api/game/node04/state");
      if (state.status === 200 && state.json) {
        setQuest(bot, state.json);
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
    trace(bot, "fout", String(error?.message || error));
  } finally {
    bot.busy = false;
    traceState(bot);
  }
}

// Logboek: de stand bij elke verandering, en anders elke 5 s.
function traceState(bot) {
  if (!bot.traced) return;
  const spot = serverSpot(bot);
  const goal = bot.goal;
  const quest = questLine(bot);
  const key = bot.doing + "|" + (goal ? Math.round(goal.x) + "," + Math.round(goal.z) : "-") + "|" + quest;
  const now = Date.now();
  if (key === bot.lastTraceKey && now - bot.lastTraceAt < 5000) return;
  bot.lastTraceKey = key;
  bot.lastTraceAt = now;
  trace(bot, "stand", bot.doing + " · server (" + round1(spot.x) + ", " + round1(spot.z) + ")"
    + (goal ? " · doel (" + round1(goal.x) + ", " + round1(goal.z) + ") " + round1(distance(spot, goal)) + " m" + (goal.route ? ", route " + goal.route.length + " punten" : ", rechtdoor") : " · geen doel")
    + " · " + quest);
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
  bot.radius = Math.max(0.2, Number(player.json?.gameWorld?.player?.radius) || 0.5);
  if (bot.traced) {
    tracedBot = bot;
    bot.tracedAt = Date.now();
    if (LOG_DIR) {
      try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        bot.traceFile = path.join(LOG_DIR, bot.name + "-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".log");
      } catch {}
    }
    trace(bot, "start", bot.name + " op (" + round1(bot.x) + ", " + round1(bot.z) + "), snelheid " + bot.speed + " m/s, loopkaart " + (navWorld?.index ? "ja" : "nee"));
  }
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
  trace(bot, "start", placed && Number.isFinite(placed.x) ? "naast jou gezet op (" + round1(placed.x) + ", " + round1(placed.z) + ")" : "niet verplaatst");
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
    errors: totals.errors.slice(),
    trace: tracedBot ? { name: tracedBot.name, file: tracedBot.traceFile, lines: tracedBot.traceLines.slice(-15) } : null
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
  } else if (message.type === "world") {
    const solids = Array.isArray(message.solids) ? message.solids : [];
    const flagged = Boolean(message.index) && ((message.index.walkables || []).some((walkable) => walkable?.flag) || solids.some((solid) => solid?.flag));
    navWorld = message.index ? { index: message.index, solids, flagged, flagCache: new Map() } : null;
    navigators.clear();
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
