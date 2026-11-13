// Werkbank Fase 8, herstel 2 en 3 na Kevins handtests (12-11 en 13-11).
// B: buitvenster (zelf kiezen wat je meeneemt) en "Automatisch buit pakken" in het game-menu.
//    Herstel 3: alle buit in de buurt samen (gelijke dingen opgeteld); weglopen of doodgaan = weg; los item meteen pakken.
// E: een oude of verlopen ruil blijft niet meer hangen. Herstel 3: Post en Ruilen onderin, spullen slepen (meer items per brief).
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
import { node05ActionBody } from "../apps/web/public/game/node05-request.js";

function setup(options = {}) {
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
      economy_rules: [Object.assign({ id: "rules.economy" }, economyValues(options.economy || null))],
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
  const hold = (id, rows, label = "Wolf", kind = "enemy", at = null) => node03.holdLoot(ctx(id), id, kind, "actor:wolf", label, rows, kind === "enemy" ? "actor_defeated" : "resource_gathered", "op_hold_" + (counter += 1), at);
  const at = (id, x, z) => Object.assign(ctx(id), { position: { x, y: 0, z } });
  const give = (id, itemId, quantity) => node03.grantItem(ctx(id), itemId, quantity, "test", null, "op_seed_" + (counter += 1));
  const items = (id, itemId) => svc.bagCount(id, itemId);
  const money = (id) => svc.currencyAmount(id, "currency.gold");
  return { db, svc, node03, ctx, at, act03, act05, hold, give, items, money };
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

test("buit: klaarleggen, één soort pakken, daarna alles pakken", () => {
  const world = setup();
  const lootId = world.hold("p1", [{ itemId: "item.pelt", quantity: 2 }, { currencyId: "currency.gold", quantity: 7 }]);
  assert.ok(lootId);
  assert.equal(world.items("p1", "item.pelt"), 0, "nog niet in je tas");
  const view = world.node03.lootForHud(world.ctx("p1"));
  assert.deepEqual(view.ids, [lootId]);
  assert.equal(view.keepSeconds, 300);
  assert.equal(view.rangeM, 15, "standaard 15 m");
  assert.equal(view.from, "Wolf");
  assert.deepEqual(view.rows.map((row) => [row.key, row.kind, row.displayName, row.quantity]),
    [["currency:currency.gold", "currency", "Goud", 7], ["item:item.pelt", "item", "Vacht", 2]], "geld bovenaan");
  assert.equal(world.node03.lootForHud(world.ctx("p2")).rows.length, 0, "Bob ziet Anna's buit niet");
  // Eén soort: alleen de vacht.
  world.act03("p1", "loot_take", { entryKey: "item:item.pelt" });
  assert.equal(world.items("p1", "item.pelt"), 2);
  assert.equal(world.money("p1"), 0);
  assert.deepEqual(world.node03.lootForHud(world.ctx("p1")).rows.map((row) => row.key), ["currency:currency.gold"]);
  assert.throws(() => world.act03("p1", "loot_take", { entryKey: "item:item.pelt" }), /ligt er niet meer/);
  // Alles pakken (ook van een tweede buit).
  world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }], "Boom", "resource");
  world.act03("p1", "loot_take_all", {});
  assert.equal(world.items("p1", "item.pelt"), 3);
  assert.equal(world.money("p1"), 7);
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 0, "alles is gepakt");
  assert.throws(() => world.act03("p1", "loot_take_all", {}), /geen buit/);
  assert.throws(() => world.act03("p1", "loot_take", {}), /Kies wat je wilt pakken/);
});

test("buit: niet van een ander pakken, en te lang laten liggen = weg", () => {
  const world = setup();
  const lootId = world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }]);
  assert.throws(() => world.act03("p2", "loot_take", { entryKey: "item:item.pelt" }), /geen buit/);
  assert.equal(world.items("p2", "item.pelt"), 0);
  world.db.prepare("UPDATE player_pending_loot SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), lootId);
  assert.throws(() => world.act03("p1", "loot_take", { entryKey: "item:item.pelt" }), /geen buit/);
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 0);
  assert.equal(world.db.prepare("SELECT state FROM player_pending_loot WHERE id = ?").get(lootId).state, "expired");
  assert.equal(world.items("p1", "item.pelt"), 0);
});

test("buit: een uniek item dat je al hebt blijft liggen; de rest pak je wel", () => {
  const world = setup();
  world.give("p1", "item.ring", 1);
  world.hold("p1", [{ itemId: "item.ring", quantity: 1 }, { itemId: "item.pelt", quantity: 1 }]);
  assert.throws(() => world.act03("p1", "loot_take", { entryKey: "item:item.ring" }), /Je hebt al Ring/);
  const all = world.act03("p1", "loot_take_all", {});
  assert.match(all.message, /Bleef liggen \(heb je al\): Ring/);
  assert.equal(world.items("p1", "item.ring"), 1);
  assert.equal(world.items("p1", "item.pelt"), 1);
  assert.deepEqual(world.node03.lootForHud(world.ctx("p1")).rows.map((row) => row.itemId), ["item.ring"]);
  // Niets geldigs om klaar te leggen: geen lege buit.
  assert.equal(world.hold("p1", [{ quantity: 3 }]), null);
});

// ---- Herstel 3 (Kevin 13-11) ----

test("buit herstel 3: alle buit in de buurt samen, gelijke dingen opgeteld (al het goud bij elkaar)", () => {
  const world = setup();
  world.hold("p1", [{ currencyId: "currency.gold", quantity: 5 }, { itemId: "item.pelt", quantity: 1 }]);
  world.hold("p1", [{ currencyId: "currency.gold", quantity: 3 }, { itemId: "item.pelt", quantity: 2 }]);
  world.hold("p1", [{ itemId: "item.ring", quantity: 1 }], "Boom", "resource");
  const view = world.node03.lootForHud(world.ctx("p1"));
  assert.equal(view.ids.length, 3);
  assert.equal(view.from, "Wolf ×2, Boom");
  assert.deepEqual(view.rows.map((row) => [row.key, row.quantity]), [["currency:currency.gold", 8], ["item:item.ring", 1], ["item:item.pelt", 3]]);
  // Eén keer Pakken op het goud = het goud van beide wolven.
  world.act03("p1", "loot_take", { entryKey: "currency:currency.gold" });
  assert.equal(world.money("p1"), 8);
  assert.deepEqual(world.node03.lootForHud(world.ctx("p1")).rows.map((row) => row.key), ["item:item.ring", "item:item.pelt"]);
});

test("buit herstel 3: weglopen (verder dan Buit pakken binnen) of doodgaan = buit weg", () => {
  const world = setup();
  const wolf = world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }], "Wolf", "enemy", { x: 10, z: 0 });
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 1, "10 m van de wolf: nog binnen 15 m");
  assert.equal(world.node03.lootForHud(world.at("p1", 30, 0)).rows.length, 0, "20 m van de wolf: weg");
  assert.equal(world.db.prepare("SELECT state FROM player_pending_loot WHERE id = ?").get(wolf).state, "expired");
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 0, "teruglopen helpt niet meer");
  assert.throws(() => world.act03("p1", "loot_take_all", {}), /in de buurt/);
  // Het schuifje in Instellingen > 💰 Geld telt.
  assert.equal(economyValues(null).lootRangeM, 15);
  const wide = setup({ economy: { lootRangeM: 40 } });
  wide.hold("p1", [{ itemId: "item.pelt", quantity: 1 }], "Wolf", "enemy", { x: 10, z: 0 });
  assert.equal(wide.node03.lootForHud(wide.at("p1", 30, 0)).rows.length, 1, "met 40 m mag het nog");
  // Oude buit zonder plek (van voor herstel 3) blijft niet hangen.
  const old = world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }]);
  world.db.prepare("UPDATE player_pending_loot SET x = NULL, z = NULL WHERE id = ?").run(old);
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 0, "zonder plek: weg");
  // Doodgaan = alles weg.
  world.hold("p1", [{ itemId: "item.pelt", quantity: 1 }]);
  world.db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, current_value, updated_at) VALUES ('p1', 'stat.health', 100, 0, ?)").run(new Date().toISOString());
  assert.equal(world.node03.lootForHud(world.ctx("p1")).rows.length, 0, "dood = weg");
  assert.equal(world.items("p1", "item.pelt"), 0, "niets per ongeluk in de tas");
});

test("post herstel 3: meer spullen in één brief (slepen uit je tas), en wat niet mag", () => {
  const world = setup();
  world.give("p1", "item.pelt", 3);
  world.give("p1", "item.ring", 1);
  const sent = world.act05("p1", "mail_send", { toName: "bob", text: "Alsjeblieft", items: [{ itemId: "item.pelt", quantity: 2 }, { itemId: "item.ring", quantity: 1 }] });
  assert.match(sent.message, /Post verstuurd naar bob met 2× Vacht en 1× Ring/);
  assert.equal(world.items("p1", "item.pelt"), 1);
  assert.equal(world.items("p1", "item.ring"), 0);
  const box = world.svc.buildMailSnapshot(world.ctx("p2"));
  assert.equal(box.messages[0].attachments.length, 2);
  world.act05("p2", "mail_claim", { mailId: box.messages[0].mailId || box.messages[0].id });
  assert.equal(world.items("p2", "item.pelt"), 2);
  assert.equal(world.items("p2", "item.ring"), 1);
  // Meer dan je hebt, of meer dan 6 soorten: er gaat niets weg.
  assert.throws(() => world.act05("p1", "mail_send", { toName: "bob", items: [{ itemId: "item.pelt", quantity: 5 }] }), /heb je niet/);
  const seven = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ itemId: "item." + id, quantity: 1 }));
  assert.throws(() => world.act05("p1", "mail_send", { toName: "bob", items: seven }), /Hooguit 6 soorten/);
  assert.equal(world.items("p1", "item.pelt"), 1);
  // De game stuurt de lijst netjes mee (alleen itemId en aantal).
  const body = node05ActionBody("node05:MAIL_SEND", { toName: "bob", items: [{ itemId: "item.pelt", quantity: "2", junk: 1 }, { itemId: "" }] }, "op_x");
  assert.deepEqual(body.items, [{ itemId: "item.pelt", quantity: 2 }]);
  assert.equal(node05ActionBody("node05:MAIL_SEND", { toName: "bob" }, "op_y").items, null);
});

test("HUD herstel 3: Post en Ruilen onderin bij Chat en Gesprek, slepen uit de tas; los item meteen pakken", () => {
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  assert.doesNotMatch(hud, /\{ id: "post", icon: "envelope"/, "Post is geen tabblad meer");
  assert.doesNotMatch(hud, /\{ id: "swap", icon: "swap-bag"/, "Ruilen is geen tabblad meer");
  assert.match(hud, /"data-act": "dock", "data-id": "post"/);
  assert.match(hud, /"data-act": "dock", "data-id": "swap"/);
  assert.match(hud, /if \(id === "post" \|\| id === "swap"\) openPane\(id\)/);
  assert.match(hud, /"data-drop": sendOff \? null : "post"/, "de post is een plek om op te laten vallen");
  assert.match(hud, /"data-drop": trade\.state === "open" \? "swap" : null/, "de ruil ook");
  assert.match(hud, /"give:" \+ item\.key/, "tasvakjes zijn sleepbaar bij Post/Ruilen");
  assert.match(hud, /if \(kind === "give"\) return giveTarget\(\)/);
  assert.doesNotMatch(hud, /"data-post-field": "itemId"/, "geen keuzelijst meer voor items");
  assert.match(hud, /autoLoot: false,/, "standaard het buitvenster");
  assert.match(hud, /toggle\("autoLoot", "chest", "Automatisch buit pakken"/);
  for (const act of ["post-attach", "post-detach", "pane-close", "loot-take", "loot-all", "loot-close", "loot-open"]) assert.ok(hud.includes('case "' + act + '"'), "HUD-knop " + act);
  assert.doesNotMatch(hud, /openPickup|pickup-take/, "geen 'Hier ligt'-kaartje meer: een los item pak je meteen");
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  for (const key of ["entryKey: extra.entryKey", "autoLoot: gkHud"]) assert.ok(game.includes(key), "game.js stuurt " + key);
  assert.doesNotMatch(game, /openPickup|lootId: extra\.lootId/);
  const css = fs.readFileSync("apps/web/public/game/hud/gk-hud.css", "utf8");
  assert.match(css, /\.gkHud\[data-dock="post"\] \.gkDock/);
  assert.match(css, /\.gkHud\[data-dock="swap"\] \.gkDock/);
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
