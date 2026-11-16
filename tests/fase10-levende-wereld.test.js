// Werkbank Fase 10: levende wereld (dag en nacht, winkel open of dicht, ...).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { CANONICAL_KINDS } from "../src/shared/authoring/kinds.js";
import { dayNightState, mixColor } from "../apps/web/public/shared/day-night.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { baseRuntimeWorld, buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { compileWorldSection } from "../src/server/authoring/world-compiler.js";

const doc = (kind, body, key) => ({ docKey: (key || kind + ":" + kind), kind, archived: false, body });
const MIN = 60000;

test("dag en nacht: 1 uur dag, 1 uur nacht, met schemer; 0 min nacht = altijd dag", () => {
  const at = (minutes, cfg = {}) => dayNightState(minutes * MIN, cfg);
  assert.equal(at(0).isDay, true);
  assert.equal(at(30).light, 1);
  assert.equal(at(59).isDay, true);
  assert.ok(at(59).light < 1 && at(59).light > 0.35, "schemer aan het eind van de dag");
  assert.equal(at(60).isDay, false);
  assert.equal(at(90).light, 0.35, "standaard 35 % licht 's nachts");
  assert.equal(Math.round(at(90).msToSwitch / MIN), 30);
  assert.equal(at(120).isDay, true, "na twee uur weer dag");
  assert.equal(at(500, { nightMinutes: 0 }).isDay, true);
  assert.equal(at(30, { dayMinutes: 20, nightMinutes: 20 }).isDay, false);
  assert.equal(mixColor("#000000", "#ffffff", 0.5), "#808080");
  // De instellingen staan in Instellingen > Wereld, in het blok Dag en nacht.
  const fields = CANONICAL_KINDS.world_settings.fields;
  assert.deepEqual([fields.dayMinutes.default, fields.nightMinutes.default, fields.nightLightPct.default], [60, 60, 35]);
  assert.equal(fields.dayMinutes.ui.group, "🌗 Dag en nacht");
  const world = baseRuntimeWorld({ worldSettings: { dayMinutes: 30, nightMinutes: 15 } });
  assert.deepEqual([world.dayNight.dayMinutes, world.dayNight.nightMinutes], [30, 15]);
  assert.equal(world.gameProject.dayNight.nightMinutes, 15, "de server weet het ook");
});

test("winkel open: alleen overdag of alleen 's nachts; dicht = kopen en verkopen geweigerd", () => {
  const docs = [
    doc("currency", { currencyId: "currency.gold", displayName: "Goud" }, "currency:currency.gold"),
    doc("item_definition", { itemId: "item.bread", displayName: "Brood", vendorValue: 2 }, "item_definition:item.bread"),
    doc("npc", { npcId: "npc.bakker", displayName: "Bakker", openHours: "day", shopCurrencyRef: "currency:currency.gold", shopOffers: [{ ref: "item_definition:item.bread", price: 3, buyBack: 0 }] }, "npc:npc.bakker")
  ];
  const section = compileGameSection(docs, {});
  assert.deepEqual(section.errors, []);
  const world = buildRuntimeWorld({ game: section.server });
  const vendor = world.gameProject.zones.packages.flatMap((pkg) => pkg.entities || []).flatMap((entity) => entity.components || [])
    .find((component) => component.nodeType === "vendor_component");
  assert.equal(vendor.openHours, "day");
  assert.equal(CANONICAL_KINDS.npc.fields.openHours.default, "always");

  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  const isDayNow = dayNightState(Date.now(), { dayMinutes: 60, nightMinutes: 60 }).isDay;
  const ctx = { project: { dayNight: { dayMinutes: 60, nightMinutes: 60, nightLightPct: 35 } } };
  const closedHours = isDayNow ? "night" : "day";
  const openHours = isDayNow ? "day" : "night";
  assert.match(svc.vendorClosedText(ctx, { openHours: closedHours }), /De winkel is dicht\. Hij gaat open als het (dag|nacht) wordt \(over \d+ min\)/);
  assert.equal(svc.vendorClosedText(ctx, { openHours }), "");
  assert.equal(svc.vendorClosedText(ctx, { openHours: "always" }), "");
  assert.match(svc.vendorClosedText({ project: { dayNight: { dayMinutes: 60, nightMinutes: 0 } } }, { openHours: "night" }), /wordt nooit nacht/);
  const src = fs.readFileSync("src/server/node05-economy-runtime-service.js", "utf8");
  assert.equal((src.match(/const closed = this\.vendorClosedText\(ctx, vendor\);\n\s+if \(closed\) throw httpError\(409, closed\);/g) || []).length, 3, "kopen, verkopen en terugkopen");
});

test("HUD en game: licht volgt de klok van de server, zon of maan op de minimap, winkel zegt dat hij dicht is", () => {
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.match(game, /window\.setInterval\(updateDayNight, 1000\)/);
  assert.match(game, /state\.runtime\.setDaylight\(clock\.light/);
  const runtime = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.match(runtime, /setDaylight: setDaylight/);
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.match(hud, /function renderSky\(\)/);
  assert.match(hud, /gkShopClosed/);
});

// ---- 📖 Bijbel: Kevins Game Bible als tab in de editor (keuze 15-11) ----
import { DatabaseSync } from "node:sqlite";
import { bibleLinks, bibleGameIndex, bibleCardName, bibleNormName } from "../apps/web/public/shared/bible-links.js";
import { BibleService, mergeBookCards } from "../src/server/authoring/bible-service.js";
import { balanceReport } from "../src/server/authoring/balance-report.js";

const kevinBible = () => JSON.parse(fs.readFileSync("README/GameBibleNode.json", "utf8"));

test("bijbel: kaartnamen uit Kevins bijbel en de koppeling met de editor (beide kanten op)", () => {
  const board = kevinBible();
  const tags = new Map(board.tags.map((tag) => [bibleNormName(tag.name), tag]));
  const name = (id) => bibleCardName(board.nodes.find((node) => node.id === id), tags);
  assert.equal(name("node-npc-thorne"), "Master Thorne", "Mentor: @{Mentor} = de waarde van de tag");
  assert.equal(name("node-mq06"), "Gloommaw in the Mire", "zonder tag: wat na de dubbele punt staat");
  assert.equal(name("node-zone-workshop"), "Willowmere Workshop");
  const docs = [
    doc("npc", { npcId: "npc.thorne", displayName: "Master Thorne", greeting: "Welkom in de werkplaats." }, "npc:npc.thorne"),
    doc("npc", { npcId: "npc.lume", displayName: "Lume" }, "npc:npc.lume"),
    doc("npc", { npcId: "npc.oud", displayName: "Oude Wachter" }, "npc:npc.oud"),
    doc("item_definition", { itemId: "item.proef", displayName: "Proef zwaard" }, "item_definition:item.proef"),
    doc("currency", { currencyId: "currency.gold", displayName: "Goud" }, "currency:currency.gold")
  ];
  const index = bibleGameIndex(docs);
  assert.ok(!index.some((entry) => entry.kind === "currency"), "valuta hoort niet in de bijbel");
  board.nodes.find((node) => node.id === "node-npc-rurik").gameRef = "npc:npc.oud";
  board.nodes.find((node) => node.id === "node-npc-arlen").gameRef = "none";
  board.nodes.find((node) => node.id === "node-npc-fenn").gameRef = "npc:npc.weg";
  const links = bibleLinks(board, index);
  assert.equal(links.cards["node-npc-thorne"].status, "game");
  assert.equal(links.cards["node-npc-thorne"].greeting, "Welkom in de werkplaats.", "wat de NPC zegt komt uit de editor");
  assert.equal(links.cards["node-npc-lume"].status, "game", "'Lume, the Little Slyph' = 'Lume'");
  assert.equal(links.cards["node-npc-rurik"].docKey, "npc:npc.oud", "met de hand gekoppeld (andere naam)");
  assert.equal(links.cards["node-npc-arlen"].status, "none", "🚫 hoort niet in de game: geen seintje");
  assert.equal(links.cards["node-npc-fenn"].lost, true, "gekoppelde editorkaart is weg");
  assert.deepEqual(links.extra.map((entry) => entry.name), ["Proef zwaard"], "in de editor, nog niet in de bijbel");
  assert.ok(links.missing.some((card) => card.name === "Gloommaw in the Mire"));
  assert.equal(links.cards["node-story-act0"], undefined, "verhaalkaarten krijgen geen seintje");
  assert.equal(links.counts.notInGame, 1);
  // ⚖️ Balans laat hetzelfde zien.
  const report = balanceReport(docs, { bible: board });
  assert.equal(report.bible.counts.inGame, links.counts.inGame);
  assert.ok(report.bible.extra.some((entry) => entry.name === "Proef zwaard"));
  assert.equal(balanceReport(docs, {}).bible, null, "geen bijbel = geen blok");
});

test("bijbel: eerste keer inlezen (oude bijbel + 12 boekkaarten links), opslaan met revision, geschiedenis", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("db/migrations/033_game_bible.sql", "utf8"));
  const service = new BibleService(db, { rootDir: process.cwd() });
  assert.equal(service.revision(), null);
  const first = service.read();
  assert.equal(first.revision, 1);
  assert.equal(first.imported, "README/GameBibleNode.json");
  const old = kevinBible();
  assert.equal(first.board.nodes.length, old.nodes.length + 12, "niets van Kevin kwijt, plus 12 hoofdstukken");
  const book = first.board.categories.find((category) => category.id === "col-book");
  assert.equal(book.title, "📚 Het boek");
  assert.ok(book.x + book.width < Math.min(...old.categories.map((category) => category.x)), "het boek staat links van de rest");
  assert.ok(first.board.edges.some((edge) => edge.from === "node-book-ch01" && edge.to === "node-npc-thorne"), "lijn naar Master Thorne");
  assert.equal(service.read().imported, null, "maar één keer inlezen");
  assert.equal(mergeBookCards(first.board, JSON.parse(fs.readFileSync("README/GameBibleBoek.json", "utf8"))).nodes.length, first.board.nodes.length, "boek niet dubbel");

  const board = first.board;
  board.nodes[0].title = "Gewijzigd";
  const saved = service.save(board, 1, { username: "kevin" });
  assert.equal(saved.revision, 2);
  assert.equal(service.read().board.nodes[0].title, "Gewijzigd");
  const history = () => db.prepare("SELECT COUNT(*) AS n FROM game_bible_history").get().n;
  assert.equal(history(), 1, "de oude versie staat in de geschiedenis");
  assert.throws(() => service.save(board, 1, { username: "kevin" }), (error) => error.status === 409 && error.code === "BIBLE_CONFLICT", "oude revision = melding, niets overschreven");
  service.save(board, 2, { username: "kevin" });
  assert.equal(history(), 1, "binnen 10 minuten geen extra versie");
  db.prepare("UPDATE game_bible_history SET saved_at = ?").run(new Date(Date.now() - 11 * MIN).toISOString());
  service.save(board, 3, { username: "kevin" });
  assert.equal(history(), 2, "na 10 minuten wel");
  assert.equal(service.revision(), 4);
  assert.throws(() => service.save({ nodes: "kapot" }, 4), (error) => error.status === 400);
  assert.throws(() => service.save({ nodes: [{ id: "x", body: "x".repeat(950 * 1024) }] }, 4), (error) => error.status === 413);
});

test("bijbel: tab in de editor, pagina praat met de GK-server (geen PHP, geen wachtwoord)", () => {
  const page = fs.readFileSync("apps/web/public/editor/bible.html", "utf8");
  assert.ok(page.includes("GAMEBIBLE_API='/api/authoring/bible'"));
  assert.ok(!/GameBibleNode\.php|GameBibleNode\.auth\.php|id="auth-password"/.test(page), "geen PHP-opslag en geen wachtwoordvak meer");
  assert.ok(page.includes("'X-GK-CSRF':gk.csrf") && page.includes("revision:gk.revision"), "opslaan met CSRF en revision");
  assert.ok(page.includes("gameRef:String(n.gameRef)"), "de koppeling blijft bewaard");
  assert.ok(page.includes("../shared/bible-links.js"), "dezelfde koppelcode als ⚖️ Balans");
  assert.ok(page.includes("gk-bible-open") && page.includes("gk-bible-new") && page.includes("gk-bible-refresh"));
  const index = fs.readFileSync("apps/web/public/editor/index.html", "utf8");
  assert.ok(index.includes('id="bibleModeButton"') && index.includes('id="bibleTabPanel"'));
  const editor = fs.readFileSync("apps/web/public/editor/editor.js", "utf8");
  assert.ok(editor.includes("function setBibleTabOpen") && editor.includes("event.source !== bibleFrame.contentWindow"));
  const routes = fs.readFileSync("src/server/authoring/routes.js", "utf8");
  assert.ok(routes.includes('"/api/authoring/bible"') && routes.includes('only") === "index"') && routes.includes('Alleen de admin mag de bijbel opslaan.'));
});

// ---- 🚶 Lopen: vijanden rondwandelen, wilde dieren rennen weg, NPC's lopen rond; 🦅 vliegers ----
import { ActorRuntime } from "../src/server/runtime/actor-runtime.js";
import { compileActorSection, npcChatterOf, npcWalkerOf } from "../src/server/authoring/actor-compiler.js";
import { npcLivePosition } from "../src/server/runtime/npc-live-positions.js";

function walkHarness(playerAt, onlyWalkers = null) {
  const section = {
    abilities: { bite: { displayName: "Beet", abilityKind: "damage", baseDamage: 5, rangeMm: 1500, cooldownMs: 1500 } },
    archetypes: {
      deer: { actorId: "deer", displayName: "Hert", behavior: "flee", aggroRangeMm: 6000, leashRangeMm: 30000, moveSpeedMmPerS: 3000, radiusMm: 500, healthMax: 20, attackPower: 3, armor: 0, abilityId: "bite", respawnMs: 30000 },
      wolf: { actorId: "wolf", displayName: "Wolf", behavior: "defensive", aggroRangeMm: 8000, leashRangeMm: 30000, moveSpeedMmPerS: 3000, radiusMm: 500, healthMax: 50, attackPower: 5, armor: 0, abilityId: "bite", respawnMs: 30000 }
    },
    spawns: [{ spawnId: "d1", actorId: "deer", xMm: 0, zMm: 0 }, { spawnId: "w1", actorId: "wolf", xMm: 40000, zMm: 0, wanderRadiusMm: 5000 }],
    resourceSpawns: [],
    npcWalkers: [{ npcId: "boer", x: 0, z: 40, rotationY: 0, radiusM: 6, speedMmPerS: 1200, stopM: 3.5 }]
  };
  if (onlyWalkers) Object.assign(section, { spawns: [], npcWalkers: onlyWalkers });
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("db/migrations/015_actor_runtime_state.sql", "utf8").split("-- Verhuizen")[0]);
  const players = [{ player_id: "p1", world_id: "w", x: playerAt.x, z: playerAt.z, current_area_id: null }];
  const sent = [];
  const hits = [];
  const worldContext = { worldId: "w", walkabilityIndex: { ground: null, walkables: [], blockers: [], surfaceBlockers: [] }, solidColliders: [] };
  const runtime = new ActorRuntime({
    db, canonicalBuild: () => ({ buildId: "b_walk", data: { actors: section } }), worldContext: () => worldContext, spatial: () => ({ index: null }),
    playerStates: () => players, isOnline: () => true, isDefeated: () => false,
    connections: () => [{ id: "c1", player: { id: "p1" } }], send: (connection, payload) => sent.push(payload)
  });
  runtime.setCombatBridge({ applyActorHit: (input) => { hits.push(input); return { damage: 3, remainingHealth: 97, defeated: false }; } });
  return { runtime, players, sent, hits };
}
const ticks = (runtime, from, count) => { let now = from; for (let i = 0; i < count; i += 1) { now += 100; runtime.tick("w", now, 100); } return now; };

test("wild dier: valt nooit aan, rent weg als je dichtbij komt of hem slaat", () => {
  const { runtime, players, hits } = walkHarness({ x: 3, z: 0 });
  let now = ticks(runtime, 5000000, 1);
  const deer = runtime.actors.get("actor:d1");
  now = ticks(runtime, now, 40);
  assert.ok(Math.hypot(deer.x - players[0].x, deer.z - players[0].z) > 6, "weggerend, verder dan 'Ziet je op'");
  assert.equal(hits.length, 0, "een wild dier slaat nooit");
  assert.notEqual(deer.state, "engage");
  players[0].x = 200; players[0].z = 0;
  now = ticks(runtime, now, 30);
  runtime.applyHit({ spawnKey: "actor:d1", occurrence: deer.occurrence, hpAfter: 15, playerId: "p1", damage: 5, abilityId: "bite" }, now, false);
  assert.equal(deer.fleeFromId, "p1", "geslagen: rent weg van wie hem sloeg");
  assert.notEqual(deer.state, "engage");
  assert.deepEqual(CANONICAL_KINDS.actor_archetype.fields.behavior.options, ["aggressive", "defensive", "flee"]);
});

test("vijand rondwandelen: blijft binnen de straal; NPC loopt rond en blijft staan als je bij hem bent", () => {
  const { runtime, players, sent } = walkHarness({ x: 20, z: 20 });
  let now = ticks(runtime, 7000000, 1);
  const wolf = runtime.actors.get("actor:w1");
  const walker = runtime.walkers.get("npcw:boer");
  let wolfMoved = 0;
  let walkerMoved = 0;
  for (let i = 0; i < 400; i += 1) {
    now = ticks(runtime, now, 1);
    wolfMoved = Math.max(wolfMoved, Math.hypot(wolf.x - 40, wolf.z));
    walkerMoved = Math.max(walkerMoved, Math.hypot(walker.x, walker.z - 40));
    assert.ok(Math.hypot(wolf.x - 40, wolf.z) <= 5.5, "de wolf blijft binnen 5 m van zijn plek");
    assert.ok(Math.hypot(walker.x, walker.z - 40) <= 6.5, "de boer blijft binnen 6 m");
  }
  assert.ok(wolfMoved > 0.5, "de wolf wandelt");
  assert.ok(walkerMoved > 0.5, "de boer loopt");
  assert.ok(sent.some((message) => message.type === "actor:snapshot" && message.actors.some((entry) => entry.k === "n" && entry.d === "boer")), "de game krijgt de lopende NPC");
  assert.deepEqual(npcLivePosition("w", "npc_entity.boer"), { x: walker.x, z: walker.z }, "winkel en quest rekenen vanaf waar hij nu staat");
  players[0].x = walker.x + 2; players[0].z = walker.z;
  now = ticks(runtime, now, 3);
  const standX = walker.x;
  now = ticks(runtime, now, 50);
  assert.equal(walker.x, standX, "speler bij hem: hij blijft staan");
  assert.equal(walker.anim, "idle");
  assert.ok(Math.abs(walker.ry - Math.PI / 2) < 0.1, "en kijkt de speler aan");
});

test("lopen in de editor: NPC 'Loopt rond' (niet met vlag), vijand-plek rondwandelen, model dat rondjes vliegt", () => {
  const npc = { npcId: "npc.boer", displayName: "Boer", x: 4, z: 5, walkMode: "wander", walkRadius: 10, talkRange: 2 };
  assert.deepEqual(npcWalkerOf(npc), { npcId: "npc.boer", x: 4, z: 5, rotationY: 0, radiusM: 10, speedMmPerS: 1200, stopM: 3 });
  assert.equal(npcWalkerOf(Object.assign({}, npc, { walkMode: "stand" })), null);
  assert.equal(npcWalkerOf(Object.assign({}, npc, { flagRef: "world_flag:f" })), null, "met een vlag blijft hij staan");
  const actors = compileActorSection([doc("npc", npc, "npc:npc.boer")]);
  assert.equal(actors.server.npcWalkers.length, 1);
  assert.equal(actors.client.npcs["npc.boer"].walks, true);
  assert.equal(CANONICAL_KINDS.actor_spawn.fields.wanderRadiusMm.default, 0, "standaard blijft een vijand staan");
  assert.equal(CANONICAL_KINDS.npc.fields.walkMode.default, "stand");

  const docs = [
    doc("npc", npc, "npc:npc.boer"),
    doc("placed_model", { placedModelId: "pm.vogels", displayName: "Vogels", modelAssetId: "asset.vogel", x: 10, y: 0, z: 20, fly: true, flyCount: 4, flyRadius: 15, flyHeight: 30, flySpeed: 5 }, "placed_model:pm.vogels")
  ];
  const section = compileGameSection(docs, {});
  const world = buildRuntimeWorld({ game: section.server });
  assert.deepEqual(world.flyers.map((flyer) => [flyer.id, flyer.count, flyer.radius, flyer.height, flyer.speed]), [["flyer.pm.vogels", 4, 15, 30, 5]]);
  assert.ok(!world.entities.some((entity) => String(entity.id || "").includes("pm.vogels")), "in de game geen stilstaand model op de plek");
  const npcEntity = world.entities.find((entity) => entity.id === "npc_entity.npc.boer");
  assert.ok(npcEntity && npcEntity.solid !== true && !(npcEntity.collision && npcEntity.collision.enabled), "een lopende NPC is geen blok op zijn plek");
  const runtimeSrc = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.ok(runtimeSrc.includes("function buildFlyers") && runtimeSrc.includes("FLYER_MAX = 40"), "vliegers: hooguit 40, alleen in de game");
  const gameSrc = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.ok(gameSrc.includes("function withWalkingNpc") && gameSrc.includes('action === "npc_walker"'), "gesprek en winkel lopen mee met de NPC");
});

test("gebiedsnaam bij binnenkomst: naam groot in beeld met één zin uit de editor", () => {
  const field = CANONICAL_KINDS.area.fields.enterText;
  assert.equal(field.maxLength, 140);
  assert.deepEqual(field.ui.soorten, ["deelgebied"], "alleen bij een deelgebied");
  const world = compileWorldSection([doc("area", { areaId: "mistbos", displayName: "Proef Mistbos", soort: "deelgebied", shape: "box",
    minXMm: 0, maxXMm: 20000, minZMm: 0, maxZMm: 20000, enterText: "Hier hangt altijd mist." }, "area:mistbos")]);
  assert.equal(world.server.areas[0].enterText, "Hier hangt altijd mist.", "de server kent de zin");
  const mmo = fs.readFileSync(new URL("../src/server/mmo-service.js", import.meta.url), "utf8");
  assert.match(mmo, /areaText: area\?\.enterText \|\| null/);
  const game = fs.readFileSync(new URL("../apps/web/public/game/game.js", import.meta.url), "utf8");
  assert.match(game, /gkHud\.areaTitle\(worldSpatial\.label, areaText\)/);
  const hud = fs.readFileSync(new URL("../apps/web/public/game/hud/gk-hud.js", import.meta.url), "utf8");
  assert.match(hud, /function areaTitle\(name, text = ""\)/);
  assert.match(fs.readFileSync(new URL("../apps/web/public/game/hud/gk-hud.css", import.meta.url), "utf8"), /\.gkAreaTitle \{/);
});

// ---- 10b verhaal in de wereld + samen veilig spelen (dempen, melden, vrienden) ----
import { LoreRuntime, LORE_READ_RANGE_M } from "../src/server/runtime/lore-runtime.js";
import { ChatRuntime, REPORT_REASONS } from "../src/server/runtime/chat-runtime.js";
import { FriendsRuntime } from "../src/server/runtime/friends-runtime.js";

function socialDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE player_profiles (id TEXT PRIMARY KEY, display_name TEXT NOT NULL)");
  db.exec(fs.readFileSync("db/migrations/021_player_blocks.sql", "utf8"));
  db.exec(fs.readFileSync("db/migrations/034_samen_spelen.sql", "utf8"));
  for (const [id, name] of [["p1", "Kevin"], ["p2", "Lyra"], ["p3", "Thorne"]]) db.prepare("INSERT INTO player_profiles (id, display_name) VALUES (?, ?)").run(id, name);
  return db;
}

test("verhaal op een model: lezen als je dichtbij staat, daarna in het kennisboek (per account, één keer)", () => {
  assert.equal(CANONICAL_KINDS.lore_entry.fields.text.ui.multiline, true);
  assert.equal(CANONICAL_KINDS.placed_model.fields.loreRef.refKind, "lore_entry");
  const docs = [
    doc("lore_entry", { loreId: "lore.graf", displayName: "Proef Grafsteen", text: "Hier rust Arlen.", category: "" }, "lore_entry:lore.graf"),
    doc("placed_model", { placedModelId: "pm.graf", displayName: "Grafsteen", modelAssetId: "asset.steen", x: 10, y: 0, z: 0, loreRef: "lore_entry:lore.graf" }, "placed_model:pm.graf"),
    doc("placed_model", { placedModelId: "pm.vogel", displayName: "Vogel", modelAssetId: "asset.vogel", x: 0, y: 0, z: 0, fly: true, loreRef: "lore_entry:lore.graf" }, "placed_model:pm.vogel"),
    doc("placed_model", { placedModelId: "pm.kapot", displayName: "Kapot", modelAssetId: "asset.steen", x: 0, y: 0, z: 0, loreRef: "lore_entry:lore.weg" }, "placed_model:pm.kapot")
  ];
  const section = compileGameSection(docs, {});
  assert.ok(section.errors.some((error) => error.code === "REF_UNRESOLVED" && error.docKey === "placed_model:pm.kapot"), "een verhaal dat weg is geeft een melding");
  const world = buildRuntimeWorld({ game: section.server });
  assert.deepEqual(world.lore["lore.graf"], { title: "Proef Grafsteen", text: "Hier rust Arlen.", category: "Verhalen" });
  assert.deepEqual(world.readables.map((entry) => [entry.id, entry.entityId, entry.loreId]), [["pm.graf", "placed.pm.graf", "lore.graf"]], "alleen het staande model met een bestaand verhaal");

  const db = socialDb();
  const ctx = { profile: { id: "p1" }, position: { x: 0, z: 0 }, world };
  let hidden = false;
  const lore = new LoreRuntime({ db, contextFor: () => ctx, flags: () => ({ passes: () => !hidden }) });
  assert.throws(() => lore.readForRequest({}, { readableId: "pm.graf" }), (error) => error.status === 409, "te ver weg (10 m)");
  ctx.position = { x: 10 - LORE_READ_RANGE_M, z: 0 };
  const first = lore.readForRequest({}, { readableId: "pm.graf" });
  assert.equal(first.first, true);
  assert.deepEqual(first.reads.map((row) => row.loreId), ["lore.graf"]);
  assert.equal(lore.readForRequest({}, { readableId: "pm.graf" }).first, false, "nog eens lezen mag, het staat er maar één keer in");
  world.readables[0].flag = { id: "f", on: true };
  hidden = true;
  assert.throws(() => lore.readForRequest({}, { readableId: "pm.graf" }), (error) => error.status === 404, "model er niet voor jou (vlag) = niets te lezen");
  assert.deepEqual(lore.stateForRequest({}).reads.map((row) => row.loreId), ["lore.graf"]);
});

test("dempen en melden: gedempt = geen chat meer van die speler; melding met zijn laatste berichten bij de maker", () => {
  const db = socialDb();
  const sent = [];
  const states = [{ player_id: "p1", x: 0, z: 0 }, { player_id: "p2", x: 1, z: 0 }, { player_id: "p3", x: 2, z: 0 }];
  const chat = new ChatRuntime({ db, project: () => null, playerStates: () => states, connectionFor: () => ({}),
    sendToPlayer: (id, payload) => { sent.push([id, payload]); return true; }, partyMemberIds: () => [] });
  const conn = (id, name) => ({ player: { id, display_name: name }, worldId: "w" });
  chat.handle(conn("p1", "Kevin"), { type: "chat:mute", payload: { playerId: "p2" } });
  assert.deepEqual(sent.find(([id, p]) => id === "p1" && p.type === "chat:mutes")[1].mutes, [{ id: "p2", name: "Lyra" }]);
  sent.length = 0;
  chat.handle(conn("p2", "Lyra"), { type: "chat:send", payload: { channel: "near", text: "jij bent stom" } });
  const got = sent.filter(([, p]) => p.type === "chat:message").map(([id]) => id);
  assert.ok(got.includes("p3") && !got.includes("p1"), "Kevin dempte Lyra, Thorne hoort haar nog");
  assert.equal(chat.hasBlocked("p1", "p2"), false, "dempen is geen blokkeren (uitnodigen en ruilen kan nog)");
  // Melden: Thorne meldt Lyra; haar bericht (dat hij kreeg) gaat mee.
  sent.length = 0;
  chat.handle(conn("p3", "Thorne"), { type: "chat:report", payload: { playerId: "p2", reason: "abuse" } });
  assert.match(sent.find(([id]) => id === "p3")[1].text, /bij de maker/);
  chat.handle(conn("p3", "Thorne"), { type: "chat:report", payload: { playerId: "p2", reason: "spam" } });
  assert.match(sent.filter(([id]) => id === "p3").pop()[1].text, /net al/, "dezelfde speler niet twee keer achter elkaar");
  const reports = chat.adminReports();
  assert.equal(reports.length, 1);
  assert.deepEqual([reports[0].reporterName, reports[0].reportedName, reports[0].reasonText, reports[0].chat.map((line) => line.text)], ["Thorne", "Lyra", "Schelden of pesten", ["jij bent stom"]]);
  chat.markReportDone(reports[0].id, "kevin");
  assert.equal(chat.adminReports()[0].status, "done");
  assert.throws(() => chat.markReportDone(reports[0].id, "kevin"), (error) => error.status === 404);
  assert.deepEqual(Object.keys(REPORT_REASONS), ["abuse", "spam", "cheat", "name", "other"]);
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  for (const key of Object.keys(REPORT_REASONS)) assert.ok(hud.includes('["' + key + '", "'), "de game kent reden " + key);
});

test("vriendenlijst: verzoek, accepteren, online-seintje; blokkeren haalt de vriendschap weg", () => {
  const db = socialDb();
  const sent = [];
  const online = new Set(["p1", "p2"]);
  const blocks = new Set();
  const friends = new FriendsRuntime({ db, connectionFor: (id) => (online.has(id) ? {} : null), sendToPlayer: (id, payload) => { sent.push([id, payload]); return true; },
    hasBlocked: (a, b) => blocks.has(a + ">" + b) });
  const conn = (id) => ({ player: { id } });
  friends.handle(conn("p1"), { type: "friend:add", payload: { name: "lyra" } });
  const listOf = (id) => sent.filter(([to, p]) => to === id && p.type === "friends:list").pop()[1].friends;
  assert.deepEqual(listOf("p1"), [{ id: "p2", name: "Lyra", state: "out", online: false }]);
  assert.deepEqual(listOf("p2"), [{ id: "p1", name: "Kevin", state: "in", online: false }]);
  assert.ok(sent.some(([to, p]) => to === "p2" && p.type === "friends:notice" && /wil je vriend worden/.test(p.text)));
  friends.handle(conn("p2"), { type: "friend:accept", payload: { playerId: "p1" } });
  assert.deepEqual(listOf("p1"), [{ id: "p2", name: "Lyra", state: "friend", online: true }]);
  // Thorne komt online: geen vriend, dus geen seintje. Lyra gaat offline en komt na een tijdje terug: Kevin krijgt een seintje.
  sent.length = 0;
  online.delete("p2");
  friends.presenceChanged("p2", false);
  assert.equal(listOf("p1")[0].online, false);
  friends.lastSeen.set("p2", Date.now() - 5 * 60000);
  online.add("p2");
  friends.presenceChanged("p2", true);
  assert.ok(sent.some(([to, p]) => to === "p1" && p.type === "friends:notice" && /Lyra is online/.test(p.text)));
  sent.length = 0;
  friends.presenceChanged("p2", true);
  assert.ok(!sent.some(([, p]) => p.type === "friends:notice"), "even herladen = geen nieuw seintje");
  // Wie jou blokkeerde kan je geen verzoek sturen; blokkeren (onBlock) haalt de vriendschap weg.
  blocks.add("p3>p1");
  friends.handle(conn("p1"), { type: "friend:add", payload: { playerId: "p3" } });
  assert.match(sent.filter(([to, p]) => to === "p1" && p.type === "friends:notice").pop()[1].text, /wil geen verzoeken/);
  friends.remove("p1", "p2", true);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM player_friends").get().total, 0);
  const mmo = fs.readFileSync("src/server/mmo-service.js", "utf8");
  assert.ok(mmo.includes("onBlock: (playerId, otherId) => this.friendsRuntime.remove(playerId, otherId, true)"), "blokkeren = geen vrienden meer");
  assert.ok(mmo.includes('message.type === "friend:add"') && mmo.includes("this.friendsRuntime?.presenceChanged(playerId, false)"));
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.ok(hud.includes('{ id: "friends", icon: "shaking-hands", title: "Vrienden", module: null, key: "KeyO" }') && hud.includes("function sheetFriends()"));
  assert.ok(hud.includes('{ id: "lore", icon: "open-book", title: "Kennisboek", module: null, key: "KeyJ" }') && hud.includes("function sheetLore()") && hud.includes("function readLore("));
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.ok(game.includes("function loreRuntimeTargets()") && game.includes('"/api/game/lore/read"'));
  const users = fs.readFileSync("apps/web/public/editor/werkbank-users.js", "utf8");
  assert.ok(users.includes('api("/api/admin/reports")'), "de maker ziet de meldingen in Instellingen > Gebruikers");
});

test("praatjes: een NPC zegt soms iets (alleen een ballon), ook als er verder geen vijanden zijn", () => {
  assert.deepEqual(npcChatterOf({ chatter: "Mooi weer.\n\n  Heb jij de smid gezien?  " }), ["Mooi weer.", "Heb jij de smid gezien?"]);
  assert.deepEqual(npcChatterOf({ chatter: "Hoi", flagRef: "world_flag:f" }), [], "een NPC met een vlag zegt niets");
  assert.equal(CANONICAL_KINDS.npc.fields.chatter.ui.group, "💬 Praatjes");
  const actors = compileActorSection([doc("npc", { npcId: "npc.smid", displayName: "Smid", x: 0, z: 0, chatter: "Het aambeeld is heet." }, "npc:npc.smid")]);
  assert.deepEqual(actors.client.npcs["npc.smid"].chatter, ["Het aambeeld is heet."]);
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.ok(game.includes("function maybeNpcChatter(") && game.includes("gkHud.npcSay(anchor.id, line, npc.name, true)"));
  assert.match(fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8"), /if \(!bubbleOnly\) chatNotice/);
});

// Kevin 16-11: een eigen route per NPC (tekenen zoals de Weg), stilstaan met een animatie per punt, snelheid, geluid; ook in de lucht.
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { cleanRoutePoint } from "../apps/web/public/editor/route-editor.js";
import { createWorldSounds } from "../apps/web/public/game/world-sounds.js";

test("route: punten met hoogte (of aan de grond), wachten en animatie; fout punt wordt geweigerd", () => {
  const base = { npcId: "npc.wachter", displayName: "Wachter", walkMode: "route", x: 0, z: 0 };
  const good = validateDocument("npc", Object.assign({}, base, { route: [{ x: 1, z: 2 }, { x: 10, z: 2, h: 4, waitS: 8, clip: "Wave" }], routeEnd: "back", walkSpeed: 2.5 }));
  assert.equal(good.ok, true, JSON.stringify(good.issues));
  for (const bad of [[{ x: 1, z: 2, y: 3 }], [{ x: 1, z: 2, h: 301 }], [{ x: 1, z: 2, waitS: -1 }], [{ x: "1", z: 2 }]]) {
    assert.equal(validateDocument("npc", Object.assign({}, base, { route: bad })).ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(cleanRoutePoint({ x: 1.234, z: 5.678, h: 2.25, waitS: 0, clip: "" }), { x: 1.23, z: 5.68, h: 2.3 }, "alleen wat afwijkt; zonder h = aan de grond");
  assert.deepEqual(CANONICAL_KINDS.npc.fields.walkMode.options, ["stand", "wander", "route"]);
  assert.deepEqual(CANONICAL_KINDS.placed_model.fields.flyMode.options, ["circle", "route"]);
  assert.equal(CANONICAL_KINDS.placed_model.fields.flyRoute.ui.when.also.key, "fly", "vliegroute alleen als Vliegt aan staat");
});

test("route lopen: NPC loopt de punten af met zijn snelheid, wacht met de animatie, gaat de hoogte op en keert om", () => {
  const npc = { npcId: "npc.w", displayName: "Wachter", x: 0, z: 40, walkMode: "route", walkSpeed: 2, routeEnd: "back",
    route: [{ x: 0, z: 40 }, { x: 6, z: 40, h: 2, waitS: 1, clip: "Wave" }], walkSound: "asset.stap" };
  const walkerSpec = npcWalkerOf(npc);
  assert.equal(walkerSpec.speedMmPerS, 2000);
  assert.equal(walkerSpec.routeLoop, false);
  assert.equal(npcWalkerOf(Object.assign({}, npc, { route: [] })), null, "route zonder punten: hij blijft staan");
  const assetInfo = new Map([["asset.stap", { assetType: "audio", sourcePath: "/assets/stap.ogg" }]]);
  const compiled = compileActorSection([doc("npc", npc, "npc:npc.w")], { assetInfo });
  assert.equal(compiled.client.npcs["npc.w"].walkSound, "asset.stap");
  assert.equal(compiled.client.assets["asset.stap"].url, "/assets/stap.ogg");

  const { runtime, players, sent } = walkHarness({ x: 30, z: 30 }, [walkerSpec]);
  let now = ticks(runtime, 8000000, 1);
  const walker = runtime.walkers.get("npcw:npc.w");
  assert.ok(walker, "de wachter loopt");
  now = ticks(runtime, now, 31);
  assert.ok(Math.abs(walker.x - 6) < 0.01 && Math.abs(walker.y - 2) < 0.01, "6 m in 3 s (2 m/s), op 2 m hoogte");
  const waiting = sent.filter((message) => message.type === "actor:snapshot").flatMap((message) => message.actors).filter((entry) => entry.d === "npc.w").pop();
  assert.equal(waiting.c, "Wave", "op het punt speelt hij zijn animatie");
  now = ticks(runtime, now, 12);
  assert.ok(walker.x < 6, "na het wachten loopt hij terug (omkeren)");
  assert.equal(walker.waitClip, null);
  players[0].x = walker.x + 1; players[0].z = walker.z;
  now = ticks(runtime, now, 2);
  const standX = walker.x;
  now = ticks(runtime, now, 10);
  assert.equal(walker.x, standX, "speler bij hem: hij blijft staan");
});

test("vliegroute en geluid: route met hoogte per punt naar de game; geluid dichtbij harder, hooguit 4, uit = stil", () => {
  const docs = [doc("placed_model", { placedModelId: "pm.draak", displayName: "Draak", modelAssetId: "asset.draak", x: 0, y: 0, z: 0, fly: true, flyCount: 1, flySpeed: 10,
    flyMode: "route", flyEnd: "loop", flyRoute: [{ x: 0, z: 0 }, { x: 50, z: 0, h: 40 }, { x: 50, z: 50, h: 40, waitS: 5, clip: "Roar" }], flySound: "asset.brul" }, "placed_model:pm.draak")];
  const section = compileGameSection(docs, {});
  const world = buildRuntimeWorld({ game: section.server });
  assert.equal(world.flyers[0].route.length, 3);
  assert.equal(world.flyers[0].route[2].clip, "Roar");
  assert.equal(world.flyers[0].loop, true);
  assert.equal(world.flyers[0].soundAssetId, "asset.brul");

  const made = [];
  const sounds = createWorldSounds({ maxPlaying: 4, range: 20, createAudio: (url) => { const audio = { url, paused: true, volume: 0, loop: false, play() { this.paused = false; }, pause() { this.paused = true; } }; made.push(audio); return audio; } });
  const sources = [0, 2, 4, 6, 8, 30].map((x, i) => ({ key: "s" + i, url: "/a.ogg", x, y: 0, z: 0 }));
  sounds.update(sources, { x: 0, y: 0, z: 0 });
  assert.equal(sounds.playingCount(), 4, "hooguit 4 tegelijk, de dichtstbijzijnde");
  assert.ok(made[0].volume > made[3].volume, "dichterbij = harder");
  sounds.setMuted(true);
  assert.equal(sounds.playingCount(), 0, "Muziek en geluid uit = stil");
  const runtimeSrc = fs.readFileSync("apps/web/public/shared/world-runtime.js", "utf8");
  assert.ok(runtimeSrc.includes("function flyerRoutePlan") && runtimeSrc.includes("function pickRouteEditor"), "vliegers volgen de route; de editor tekent hem");
});
