// Werkbank Fase 8, herstel 2 na Kevins handtest (12-11).
// B: buitvenster (zelf kiezen wat je meeneemt) en "Automatisch buit pakken" in het game-menu.
// E: een oude of verlopen ruil blijft niet meer hangen.
// F: de marktbelasting betaalt de koper erbovenop; de verkoper krijgt zijn hele prijs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { economyValues } from "../src/shared/authoring/kinds/economy.js";
import { tradeValues } from "../src/shared/authoring/kinds/trade.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node05EconomyRuntimeService, marketTaxFor } from "../src/server/node05-economy-runtime-service.js";
import { runOperation } from "../src/server/persistence/operation-contract.js";
import { sanitizeCombatIntent } from "../src/server/runtime/combat-adapter.js";

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  const stamp = new Date().toISOString();
  for (const [id, name] of [["p1", "anna"], ["p2", "bob"]]) {
    db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES (?, ?, 'x', 'x', 'player', ?, ?)").run("u" + id, name, stamp, stamp);
    db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES (?, ?, ?, 'class.healer', 'world.main', ?, ?)").run(id, "u" + id, name, stamp, stamp);
  }
  const catalogs = {
    items: {
      "item.pelt": { id: "item.pelt", displayName: "Vacht", stackable: true, tradable: true, vendorBaseValueMinor: 10 },
      "item.ring": { id: "item.ring", displayName: "Ring", stackable: true, tradable: true, unique: true, vendorBaseValueMinor: 50 }
    },
    currencies: { "currency.gold": { id: "currency.gold", displayName: "Goud" } }
  };
  const project = {
    catalogs,
    playerRules: { byType: {
      economy_rules: [Object.assign({ id: "rules.economy" }, economyValues(null))],
      trade_rules: [Object.assign({ id: "rules.trade" }, tradeValues({ actionsPerHour: 1000 }))]
    } }
  };
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  svc.db = db;
  svc.node03RuntimeService = node03;
  svc.mmoService = {
    getConnectionForPlayer: (playerId) => ({ playerId }),
    countConnectedPlayerSessions: () => 1,
    getWorldPlayerStates: (worldId, ids) => (ids || []).map((id) => ({ player_id: id, x: 0, y: 0, z: 0 })),
    sendToPlayer: () => true,
    chatRuntime: null
  };
  const ctx = (id) => {
    const profile = db.prepare("SELECT * FROM player_profiles WHERE id = ? LIMIT 1").get(id);
    return { profile, worldId: "world.main", zoneId: "zone.start", project, catalogs, zonePackage: { entities: [], entityComponents: [] }, position: { x: 0, y: 0, z: 0 } };
  };
  let counter = 0;
  // Net als de echte route: alles in één transactie (een fout rolt alles terug).
  const run = (id, perform) => {
    const opId = "op_" + (counter += 1);
    const where = ctx(id);
    return runOperation(db, { operationId: opId, playerId: id, operationType: "test", requestHash: opId,
      perform: () => perform(where, opId), buildResponse: (result) => Object.assign({ ok: true, operationId: opId }, result) });
  };
  const act03 = (id, action, payload = {}) => run(id, (where, opId) => node03.performAction(where, action, payload, opId));
  const act05 = (id, action, payload = {}) => run(id, (where, opId) => svc.performAction(where, action, payload, opId));
  const hold = (id, rows, label = "Wolf", kind = "enemy") => node03.holdLoot(ctx(id), id, kind, "actor:wolf", label, rows, kind === "enemy" ? "actor_defeated" : "resource_gathered", "op_hold_" + (counter += 1));
  const give = (id, itemId, quantity) => node03.grantItem(ctx(id), itemId, quantity, "test", null, "op_seed_" + (counter += 1));
  const items = (id, itemId) => svc.bagCount(id, itemId);
  const money = (id) => svc.currencyAmount(id, "currency.gold");
  return { db, svc, node03, ctx, act03, act05, hold, give, items, money };
}

// ---- B: buitvenster ----

test("buit: zonder voorkeur gaat buit meteen in je tas (zoals vroeger); de speler kan het per actie zeggen", () => {
  const world = setup();
  assert.equal(world.node03.autoLootFor("p1"), true, "onbekend = automatisch (oude spelers en tests blijven gelijk)");
  world.node03.rememberAutoLoot("p1", false);
  assert.equal(world.node03.autoLootFor("p1"), false);
  assert.equal(world.node03.autoLootFor("p2"), true, "per speler");
  world.node03.rememberAutoLoot("p1", "nee");
  assert.equal(world.node03.autoLootFor("p1"), false, "alleen echt aan/uit telt");
  world.node03.rememberAutoLoot("p1", true);
  assert.equal(world.node03.autoLootFor("p1"), true);
  // Het vinkje komt door de gevechtsfilter heen (het is een keuze, geen uitkomst).
  assert.equal(sanitizeCombatIntent("attack", { targetId: "actor:wolf", autoLoot: false }).autoLoot, false);
  assert.equal(sanitizeCombatIntent("skill", { slot: 2, autoLoot: true }).autoLoot, true);
  assert.equal("autoLoot" in sanitizeCombatIntent("gather", { targetId: "res:tree" }), false);
});

test("buit: klaarleggen, één regel pakken, daarna alles pakken", () => {
  const world = setup();
  const lootId = world.hold("p1", [{ itemId: "item.pelt", quantity: 2 }, { currencyId: "currency.gold", quantity: 7 }]);
  assert.ok(lootId);
  assert.equal(world.items("p1", "item.pelt"), 0, "nog niet in je tas");
  const view = world.node03.lootForHud(world.ctx("p1"));
  assert.equal(view.pending.length, 1);
  assert.equal(view.keepSeconds, 300);
  assert.equal(view.pending[0].label, "Wolf");
  assert.deepEqual(view.pending[0].entries.map((entry) => [entry.key, entry.kind, entry.displayName, entry.quantity]),
    [["1", "item", "Vacht", 2], ["2", "currency", "Goud", 7]]);
  assert.equal(world.node03.lootForHud(world.ctx("p2")).pending.length, 0, "Bob ziet Anna's buit niet");
  // Eén regel: alleen de vacht.
  world.act03("p1", "loot_take", { lootId, entryKey: "1" });
  assert.equal(world.items("p1", "item.pelt"), 2);
  assert.equal(world.money("p1"), 0);
  assert.deepEqual(world.node03.lootForHud(world.ctx("p1")).pending[0].entries.map((entry) => entry.key), ["2"]);
  assert.throws(() => world.act03("p1", "loot_take", { lootId, entryKey: "1" }), /ligt er niet meer/);
  // Alles pakken (ook uit een tweede buit).
  world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }], "Boom", "resource");
  world.act03("p1", "loot_take_all", {});
  assert.equal(world.items("p1", "item.pelt"), 3);
  assert.equal(world.money("p1"), 7);
  assert.equal(world.node03.lootForHud(world.ctx("p1")).pending.length, 0, "alles is gepakt");
  assert.throws(() => world.act03("p1", "loot_take_all", {}), /ligt er niet meer/);
  assert.throws(() => world.act03("p1", "loot_take", { lootId }), /Kies wat je wilt pakken/);
});

test("buit: niet van een ander pakken, en te lang laten liggen = weg", () => {
  const world = setup();
  const lootId = world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }]);
  assert.throws(() => world.act03("p2", "loot_take", { lootId, entryKey: "1" }), /ligt er niet meer/);
  assert.equal(world.items("p2", "item.pelt"), 0);
  world.db.prepare("UPDATE player_pending_loot SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), lootId);
  assert.throws(() => world.act03("p1", "loot_take", { lootId, entryKey: "1" }), /te lang blijven liggen/);
  assert.equal(world.node03.lootForHud(world.ctx("p1")).pending.length, 0);
  assert.equal(world.db.prepare("SELECT state FROM player_pending_loot WHERE id = ?").get(lootId).state, "expired");
  assert.equal(world.items("p1", "item.pelt"), 0);
});

test("buit: een uniek item dat je al hebt blijft liggen; de rest pak je wel", () => {
  const world = setup();
  world.give("p1", "item.ring", 1);
  const lootId = world.hold("p1", [{ itemId: "item.ring", quantity: 1 }, { itemId: "item.pelt", quantity: 1 }]);
  assert.throws(() => world.act03("p1", "loot_take", { lootId, entryKey: "1" }), /Je hebt al Ring/);
  const all = world.act03("p1", "loot_take_all", { lootId });
  assert.match(all.message, /Bleef liggen \(heb je al\): Ring/);
  assert.equal(world.items("p1", "item.ring"), 1);
  assert.equal(world.items("p1", "item.pelt"), 1);
  assert.deepEqual(world.node03.lootForHud(world.ctx("p1")).pending[0].entries.map((entry) => entry.itemId), ["item.ring"]);
  // Niets geldigs om klaar te leggen: geen lege buit.
  assert.equal(world.hold("p1", [{ quantity: 3 }]), null);
});

test("buit: de game stuurt het vinkje en de buitregel mee; de HUD heeft het menu en het vinkje", () => {
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  for (const key of ["lootId: extra.lootId", "entryKey: extra.entryKey", "autoLoot: gkHud"]) assert.ok(game.includes(key), "game.js stuurt " + key);
  assert.match(game, /action === "pickup" && gkHud && typeof gkHud\.openPickup === "function"/, "een pickup laat eerst zien wat het is");
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.match(hud, /autoLoot: false,/, "standaard het buitvenster");
  assert.match(hud, /toggle\("autoLoot", "chest", "Automatisch buit pakken"/);
  for (const act of ["loot-take", "loot-all", "loot-close", "loot-open", "pickup-take", "pickup-no"]) assert.ok(hud.includes('case "' + act + '"'), "HUD-knop " + act);
});

// ---- E: een oude ruil blijft niet hangen ----

test("ruilen: een verlopen ruil verdwijnt uit beeld en Nee/Afbreken werkt er altijd op", () => {
  const world = setup();
  const invited = world.act05("p1", "trade_invite", { targetPlayerId: "p2" });
  assert.equal(world.svc.buildTradeSnapshot(world.ctx("p2")).sessions.length, 1);
  // De tijd is om (zoals de oude ruil van Fase 8 die bleef hangen).
  world.db.prepare("UPDATE direct_trade_sessions SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), invited.tradeId);
  assert.throws(() => world.act05("p2", "trade_accept", { tradeId: invited.tradeId }), /verlopen/);
  assert.equal(world.svc.buildTradeSnapshot(world.ctx("p2")).sessions.length, 0, "niet meer in beeld");
  assert.equal(world.svc.buildTradeSnapshot(world.ctx("p1")).sessions.length, 0);
  assert.equal(world.db.prepare("SELECT state FROM direct_trade_sessions WHERE id = ?").get(invited.tradeId).state, "expired", "echt dicht");
  const cancelled = world.act05("p2", "trade_cancel", { tradeId: invited.tradeId });
  assert.match(cancelled.message, /al afgelopen/);
  // Daarna kun je gewoon een nieuwe ruil beginnen.
  const again = world.act05("p1", "trade_invite", { targetPlayerId: "p2" });
  assert.notEqual(again.tradeId, invited.tradeId);
  assert.equal(world.svc.buildTradeSnapshot(world.ctx("p2")).sessions.length, 1);
});

test("ruilen: zolang iemand iets doet, blijft de ruil open", () => {
  const world = setup();
  const invited = world.act05("p1", "trade_invite", { targetPlayerId: "p2" });
  const soon = new Date(Date.now() + 5000).toISOString();
  world.db.prepare("UPDATE direct_trade_sessions SET expires_at = ? WHERE id = ?").run(soon, invited.tradeId);
  world.act05("p2", "trade_accept", { tradeId: invited.tradeId });
  const after = world.db.prepare("SELECT expires_at, state FROM direct_trade_sessions WHERE id = ?").get(invited.tradeId);
  assert.equal(after.state, "open");
  assert.ok(Date.parse(after.expires_at) > Date.parse(soon) + 10000, "de tijd begint opnieuw bij elke actie");
});

// ---- F: marktbelasting ----

test("markt: belasting is minstens 1 als er belasting is, en afgerond naar boven", () => {
  assert.equal(marketTaxFor(30, 5), 2, "1,5 wordt 2");
  assert.equal(marketTaxFor(200, 10), 20);
  assert.equal(marketTaxFor(1, 5), 1, "ook bij 1 Goud iets belasting");
  assert.equal(marketTaxFor(100, 0), 0, "0 % = geen belasting");
  assert.equal(marketTaxFor(0, 18), 0);
  assert.equal(marketTaxFor(100, 18), 18, "Kevins 18 %");
});

// ---- C: oude winkelregels met een eigen prijs (vaak 10 van vroeger) ----

test("winkel-kaart: één knop zet alle eigen prijzen terug op automatisch (0)", () => {
  const docs = fs.readFileSync("apps/web/public/editor/werkbank-docs.js", "utf8");
  assert.match(docs, /Alle prijzen automatisch/);
  assert.match(docs, /key === "price" \|\| key === "buyBack"/, "kopen én terugkopen");
  assert.match(docs, /row\[key\] = 0/);
});
