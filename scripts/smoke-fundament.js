// Smoke "fundament zonder nodes" (doelbeeld): een echte server met een lege database.
// Bewijst: geen nodes nodig -> kaarten -> SAVE TO GAME (build) -> inloggen, lopen, pickup exact één keer pakken,
// en de spelregels uit kaarten: start-spullen, winkel, uitrusten, crafting en een quest.
// Draait op een eigen tijdelijke server (willekeurige poort, lege data); raakt :3001 en Kevins data niet aan.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { createIsolatedRuntime, requireIsolatedMode } from "./lib/test-isolation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_PASSWORD = "k1k2k3k4k5";
let BASE = "";
let passed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  passed += 1;
  console.log("  ✓ " + message);
}

function jar() {
  return { cookie: "", csrf: "" };
}

async function call(method, pathname, body, who) {
  const headers = { Origin: BASE };
  if (who.cookie) headers.Cookie = who.cookie;
  if (method !== "GET" && who.csrf) headers["X-GK-CSRF"] = who.csrf;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(BASE + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  for (const line of setCookie) {
    const pair = line.split(";")[0];
    const name = pair.split("=")[0];
    const rest = who.cookie.split("; ").filter((entry) => entry && !entry.startsWith(name + "="));
    who.cookie = rest.concat([pair]).join("; ");
  }
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (json?.csrfToken) who.csrf = json.csrfToken;
  return { status: response.status, json, text };
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(BASE + "/api/health")).ok) return; } catch { /* nog niet klaar */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Server startte niet binnen de timeout.");
}

function openSocket(who) {
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/api/game/live", { headers: { Origin: BASE, Cookie: who.cookie } });
  const messages = [];
  const waiters = [];
  ws.on("message", (data) => {
    let message = null;
    try { message = JSON.parse(String(data)); } catch { return; }
    if (message.type === "ping") ws.send(JSON.stringify({ type: "pong", clientPingSeq: message.clientPingSeq || null, clientSentAt: message.clientSentAt || null }));
    messages.push(message);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (!waiters[index].predicate(message)) continue;
      clearTimeout(waiters[index].timer);
      waiters.splice(index, 1)[0].resolve(message);
    }
  });
  return {
    ws,
    opened: new Promise((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); }),
    wait(predicate, timeoutMs = 8000) {
      const found = messages.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("wachtte te lang op een bericht; laatste: " + messages.slice(-5).map((m) => m.type).join(", "))), timeoutMs);
        waiters.push({ predicate, resolve, timer });
      });
    },
    send(payload) { ws.send(JSON.stringify(payload)); },
    close() { try { ws.close(); } catch { /* al dicht */ } }
  };
}

async function main() {
  requireIsolatedMode();
  const runtime = await createIsolatedRuntime(rootDir, "smoke-fundament");
  BASE = "http://127.0.0.1:" + runtime.port;
  const child = spawn(process.execPath, ["src/server/server.js"], {
    cwd: rootDir,
    env: runtime.env({ ADMIN_PASSWORD, ADMIN_USERNAME: "kevin", GAME_POSITION_PERSIST_DEBOUNCE_MS: "150" }),
    stdio: ["ignore", "ignore", "pipe"]
  });
  child.stderr.on("data", (data) => process.stderr.write("[server] " + data));
  let failed = false;
  try {
    await waitForHealth(30000);
    console.log("Server draait op een lege database.");
    const admin = jar();
    const player = jar();

    console.log("1. Zonder nodes en zonder kaarten is er al een wereld");
    const world0 = await call("GET", "/api/game/world", undefined, jar());
    assert(world0.status === 200 && world0.json?.source === "authoring-build" && world0.json?.world?.id === "world.main", "de game heeft meteen een wereld uit de build-bouwer");
    const login = await call("POST", "/api/auth/login", { username: "kevin", password: ADMIN_PASSWORD }, admin);
    assert(login.status === 200, "admin logt in");
    const graph = await call("GET", "/api/editor/graph", undefined, admin);
    assert(graph.status === 200 && (graph.json?.nodes || []).filter((node) => node.type !== "game_output").length === 0, "er staan geen nodes in de database");
    const oldPublish = await call("POST", "/api/editor/publish", {}, admin);
    assert(oldPublish.status === 410, "publiceren uit Nodes bestaat niet meer (410)");

    console.log("2. Kaarten maken en SAVE TO GAME (build)");
    const workspace = await call("GET", "/api/authoring/workspace", undefined, admin);
    assert(workspace.status === 200 && workspace.json.zones.length === 1 && workspace.json.zones[0].zoneId === "zone.world", "de Werkbank kent één wereld");
    let n = 0;
    const command = (input) => call("POST", "/api/authoring/command", Object.assign({ requestId: "smoke-fundament-" + (n += 1) }, input), admin);
    assert((await command({ command: "create", kind: "world_settings", body: { groundSize: 400, startX: 2, startZ: 2, skyColor: "#88aacc" } })).status === 201, "kaart Wereld aangemaakt");
    assert((await command({ command: "create", kind: "item_definition", body: { itemId: "item.smoke_steen", displayName: "Smoke Steen", category: "material", rarity: "common", stackable: true, stackLimit: 99 } })).status === 201, "item aangemaakt");
    assert((await command({ command: "create", kind: "pickup", body: { pickupId: "pickup.smoke_steen", itemRef: "item_definition:item.smoke_steen", zoneRef: "zone.world", x: 3, y: 0, z: 3, amount: 2, respawnPolicyRef: "respawn_policy.slow" } })).status === 201, "pickup geplaatst");
    const editorWorld = await call("GET", "/api/editor/draft-world", undefined, admin);
    assert(editorWorld.status === 200 && editorWorld.json.spawn?.x === 2 && editorWorld.json.ground?.maxX === 200, "de editor-view toont de kaarten meteen (concept)");
    const gameBefore = await call("GET", "/api/game/world", undefined, player);
    assert(gameBefore.json.spawn?.x === 0, "de game verandert pas na SAVE TO GAME");
    const publish = await call("POST", "/api/authoring/publish", {}, admin);
    assert(publish.status === 200 && /^b_/.test(publish.json?.buildId || ""), "SAVE TO GAME maakt een build (" + publish.status + " " + (publish.json?.message || "") + ")");
    const gameAfter = await call("GET", "/api/game/world", undefined, player);
    assert(gameAfter.json.spawn?.x === 2 && gameAfter.json.ground?.maxX === 200 && gameAfter.json.world.backgroundColor === "#88aacc", "de game draait op de nieuwe build");

    console.log("3. Speler: inloggen, lopen, pickup pakken");
    assert((await call("POST", "/api/auth/register", { identifier: "smoke_fundament", password: "smoke_fundament_pw", deviceLabel: "pc" }, player)).status === 201, "speler registreert");
    const playerLoad = await call("GET", "/api/game/player", undefined, player);
    assert(playerLoad.status === 200 && playerLoad.json.worldId === "world.main", "speler komt in de wereld");
    assert(Math.abs(playerLoad.json.position.x - 2) < 0.01 && Math.abs(playerLoad.json.position.z - 2) < 0.01, "speler start op de startplek uit de kaart Wereld");
    const socket = openSocket(player);
    await socket.opened;
    const ready = await socket.wait((message) => message.type === "connection:ready");
    assert(ready.playerId === playerLoad.json.player.id, "live verbinding staat");
    socket.send({ type: "player:input_state", payload: { clientSessionId: "smoke-fundament", inputSeq: 1, controllerEpoch: 1, clientSentAt: Date.now(), input: { moveX: 1, moveZ: 0, sprint: false, pointerTarget: null, stop: false } } });
    await socket.wait((message) => message.type === "mmo:snapshot" && (message.players || []).some((entry) => entry.playerId === ready.playerId && Number(entry.lastProcessedInputSeq || 0) >= 1));
    await new Promise((resolve) => setTimeout(resolve, 400));
    socket.send({ type: "player:input_state", payload: { clientSessionId: "smoke-fundament", inputSeq: 2, controllerEpoch: 1, clientSentAt: Date.now(), input: { moveX: 0, moveZ: 0, sprint: false, pointerTarget: null, stop: true } } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const moved = await call("GET", "/api/game/player", undefined, player);
    assert(Math.hypot(moved.json.position.x - 2, moved.json.position.z - 2) > 0.5, "de speler loopt (server-positie veranderd naar " + moved.json.position.x.toFixed(2) + ", " + moved.json.position.z.toFixed(2) + ")");
    socket.close();
    const state = await call("GET", "/api/game/node03/state", undefined, player);
    const target = (state.json?.interactionTargets || []).find((entry) => String(entry.instanceId || "").includes("pickup.smoke_steen"));
    assert(Boolean(target), "de pickup uit de kaart ligt in de game");
    const claim = await call("POST", "/api/game/node03/action", { action: "pickup", targetId: target.instanceId, operationId: "smoke-fundament-claim-1" }, player);
    assert(claim.status === 200 && claim.json.grants?.length === 1, "de speler pakt de pickup op (" + claim.status + " " + (claim.json?.message || claim.json?.code || "") + ")");
    const again = await call("POST", "/api/game/node03/action", { action: "pickup", targetId: target.instanceId, operationId: "smoke-fundament-claim-2" }, player);
    assert(!(again.json?.grants || []).length, "dezelfde pickup is niet twee keer te pakken");
    const inventory = await call("GET", "/api/game/node03/state", undefined, player);
    const count = (inventory.json?.inventory?.items || []).filter((row) => row.itemId === "item.smoke_steen").reduce((total, row) => total + Number(row.quantity || 0), 0);
    assert(count === 2, "de tas heeft 2x Smoke Steen");

    console.log("4. Spelregels uit kaarten: start-spullen, winkel, uitrusten, crafting en een quest");
    const created = async (kind, body, label) => {
      const result = await command({ command: "create", kind, body });
      assert(result.status === 201, label + " (" + result.status + " " + (result.json?.message || result.json?.code || "") + ")");
    };
    await created("currency", { currencyId: "currency.goud", displayName: "Goud" }, "kaart Valuta Goud");
    await created("item_definition", { itemId: "item.hout", displayName: "Hout", category: "material", rarity: "common", stackable: true, stackLimit: 99 }, "item Hout");
    await created("item_definition", { itemId: "item.plank", displayName: "Plank", category: "material", rarity: "common", stackable: true, stackLimit: 99 }, "item Plank");
    await created("item_definition", { itemId: "item.zwaard", displayName: "Zwaard", category: "equipment", rarity: "common", stackable: false, stackLimit: 1, equipSlot: "equipment_slot.main_hand", attackPowerBonus: 5 }, "item Zwaard");
    await created("player_class", { classId: "class.held", displayName: "Held", healthMax: 150, attackPower: 12, armor: 3, healPower: 5, startItems: [{ ref: "currency:currency.goud", amount: 30 }, { ref: "item_definition:item.hout", amount: 4 }] }, "klasse Held");
    await created("player_class", { classId: "class.tank", displayName: "Tank", healthMax: 100, attackPower: 5, armor: 10, healPower: 5 }, "klasse Tank");
    await created("npc", { npcId: "npc.smid", displayName: "Smid", x: 3, y: 0, z: 2, shopOffers: [{ ref: "item_definition:item.zwaard", price: 10, buyBack: 0 }], shopCurrencyRef: "currency:currency.goud", crafting: true }, "NPC Smid (winkel + werkbank)");
    await created("npc", { npcId: "npc.boer", displayName: "Boer", x: 2, y: 0, z: 3 }, "NPC Boer");
    await created("quest", { questId: "quest.hout", displayName: "Hout halen", giverRef: "npc:npc.boer", goal: "deliver", itemRef: "item_definition:item.hout", amount: 2, rewards: [{ ref: "currency:currency.goud", amount: 5 }], rewardXp: 40 }, "Quest Hout halen");
    await created("recipe", { recipeId: "recipe.plank", displayName: "Plank zagen", ingredients: [{ ref: "item_definition:item.hout", amount: 2 }], outputItemRef: "item_definition:item.plank", outputAmount: 1, craftSeconds: 0 }, "Recept Plank");
    const publish2 = await call("POST", "/api/authoring/publish", {}, admin);
    assert(publish2.status === 200, "SAVE TO GAME met spelkaarten (" + publish2.status + " " + (publish2.json?.message || JSON.stringify(publish2.json?.errors || "")) + ")");
    const speler = jar();
    assert((await call("POST", "/api/auth/register", { identifier: "smoke_spel", password: "smoke_spel_pw", deviceLabel: "pc" }, speler)).status === 201, "tweede speler registreert");
    assert((await call("GET", "/api/game/player", undefined, speler)).status === 200, "tweede speler komt in de wereld");
    const n03 = async () => (await call("GET", "/api/game/node03/state", undefined, speler)).json;
    const goud = (snapshot) => (snapshot.currencies || []).find((row) => row.currencyId === "currency.goud")?.amountMinor || 0;
    const stuks = (snapshot, itemId) => (snapshot.inventory?.items || []).filter((row) => row.itemId === itemId).reduce((total, row) => total + Number(row.quantity || 1), 0);
    let snap = await n03();
    assert(snap.stats?.byId?.["stat.health"]?.baseValue === 150, "levens komen uit de eerste klasse, Held (150)");
    assert(goud(snap) === 30 && stuks(snap, "item.hout") === 4, "start-spullen: 30 Goud en 4 Hout");
    const n05 = (await call("GET", "/api/game/node05/state", undefined, speler)).json;
    const vendor = (n05?.vendors?.vendors || []).find((entry) => entry.vendorId === "vendor.npc.smid");
    assert(Boolean(vendor), "de Smid heeft een winkel");
    const buy = await call("POST", "/api/game/node05/action", { action: "vendor_buy", vendorId: "vendor.npc.smid", offerId: "offer.npc.smid.item.zwaard", quantity: 1, operationId: "smoke-spel-buy" }, speler);
    assert(buy.status === 200, "zwaard kopen (" + buy.status + " " + (buy.json?.message || "") + ")");
    snap = await n03();
    assert(goud(snap) === 20, "na kopen 20 Goud over");
    const zwaard = (snap.inventory?.items || []).find((row) => row.itemId === "item.zwaard");
    assert(Boolean(zwaard?.instanceId && zwaard?.equipSlot), "het zwaard zit in de tas en kan uitgerust worden");
    const equip = await call("POST", "/api/game/node03/action", { action: "equip", itemInstanceId: zwaard.instanceId, operationId: "smoke-spel-equip" }, speler);
    assert(equip.status === 200, "zwaard uitrusten (" + equip.status + " " + (equip.json?.message || "") + ")");
    snap = await n03();
    assert(JSON.stringify(snap.equipment || {}).includes(zwaard.instanceId), "het zwaard zit in de uitrusting");
    const craft = await call("POST", "/api/game/node05/action", { action: "craft", recipeId: "recipe.plank", stationId: "station.npc.smid", operationId: "smoke-spel-craft" }, speler);
    assert(craft.status === 200, "plank maken bij de Smid (" + craft.status + " " + (craft.json?.message || "") + ")");
    snap = await n03();
    assert(stuks(snap, "item.plank") === 1 && stuks(snap, "item.hout") === 2, "1 Plank gemaakt van 2 Hout");
    const talk = (body, id) => call("POST", "/api/game/node04/action", Object.assign({ targetId: "target.npc.npc.boer", operationId: "smoke-spel-" + id }, body), speler);
    const hello = await talk({ action: "start_dialogue" }, "talk1");
    assert(hello.status === 200 && (hello.json?.dialogue?.choices || []).some((choice) => choice.choiceId === "choice.ask.quest.hout"), "de Boer biedt de quest aan");
    await talk({ action: "choose_dialogue", entryId: "entry.start", choiceId: "choice.ask.quest.hout" }, "ask");
    const accept = await talk({ action: "choose_dialogue", entryId: "entry.offer.quest.hout", choiceId: "choice.accept.quest.hout" }, "accept");
    assert(accept.status === 200, "quest aannemen (" + accept.status + " " + (accept.json?.message || "") + ")");
    const done = await talk({ action: "choose_dialogue", entryId: "entry.start", choiceId: "choice.done.quest.hout" }, "done");
    assert(done.status === 200, "quest inleveren (" + done.status + " " + (done.json?.message || "") + ")");
    snap = await n03();
    assert(goud(snap) === 25 && stuks(snap, "item.hout") === 0 && Number(snap.progression?.xp || 0) >= 40, "beloning: +5 Goud en 40 XP, het hout is ingeleverd");

    console.log("4b. Klassen: per klasse een eigen character, wisselen houdt de voortgang");
    const characters = (await call("GET", "/api/game/characters", undefined, speler)).json;
    assert((characters?.classes || []).map((entry) => entry.classId).join(",") === "class.held,class.tank", "Characters-venster toont Held en Tank");
    assert(characters.classes[0].character?.active === true && characters.classes[1].character === null, "je speelt als Held; nog geen Tank");
    assert((await call("POST", "/api/game/characters/play", { classId: "class.tank" }, speler)).status === 200, "wissel naar een nieuwe Tank");
    assert((await call("GET", "/api/game/player", undefined, speler)).status === 200, "de Tank komt in de wereld");
    snap = await n03();
    assert(snap.stats?.byId?.["stat.armor"]?.baseValue === 10 && goud(snap) === 0, "de Tank begint opnieuw: pantser 10, geen goud");
    assert((await call("POST", "/api/game/characters/play", { classId: "class.held" }, speler)).status === 200, "terug naar de Held");
    snap = await n03();
    assert(goud(snap) === 25, "de Held heeft zijn goud nog (25)");

    console.log("5. Nog steeds geen nodes");
    const graphAfter = await call("GET", "/api/editor/graph", undefined, admin);
    assert((graphAfter.json?.nodes || []).filter((node) => node.type !== "game_output").length === 0, "na alles staan er nog steeds geen nodes in de database");
    console.log("\nSMOKE FUNDAMENT GESLAAGD (" + passed + " controles)");
  } catch (error) {
    failed = true;
    console.error("\nSMOKE FUNDAMENT MISLUKT na " + passed + " controles:", error.message);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve)).catch(() => {});
    runtime.cleanup();
  }
  process.exit(failed ? 1 : 0);
}

main();
