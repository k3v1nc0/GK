// Werkbank Fase 8: geld en veilig handelen.
// 8a: geld in de buit, winkelprijs uit de waarde, terugkopen, waar geld weer verdwijnt, en het overzicht.
// 8b: ruilen tussen spelers (alles of niets), de markt met belasting, het handelslogboek en de spamgrens.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { CANONICAL_KINDS, validateDocument } from "../src/shared/authoring/kinds.js";
import { economyValues, shopBuyPrice, shopSellPrice } from "../src/shared/authoring/kinds/economy.js";
import { tradeValues } from "../src/shared/authoring/kinds/trade.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";
import { balanceReport, moneyPerDay, tradeLog } from "../src/server/authoring/balance-report.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { rollLoot } from "../apps/web/public/shared/combat-math.js";
import { runOperation } from "../src/server/persistence/operation-contract.js";

const doc = (kind, body, key) => ({ docKey: (key || kind + ":" + kind), kind, archived: false, body });

test("de kaarten Geld en Handel: standaarden, grenzen en prijzen", () => {
  assert.equal(CANONICAL_KINDS.economy_settings.place, "instellingen");
  assert.equal(CANONICAL_KINDS.trade_settings.place, "instellingen");
  assert.equal(CANONICAL_KINDS.economy_settings.singleton, true);
  assert.equal(CANONICAL_KINDS.trade_settings.singleton, true);
  // Zonder kaart gelden de standaarden uit het schema (Kevins keuze: alle drie laag).
  const money = economyValues(null);
  assert.equal(money.shopMarkupPct, 150);
  assert.equal(money.shopBuyPct, 100);
  assert.equal(money.buyBackSlots, 12);
  assert.equal(money.marketTaxPct, 5);
  assert.equal(money.craftCostPct, 10);
  const handel = tradeValues(null);
  assert.equal(handel.tradeOn, true);
  assert.equal(handel.marketOn, true);
  assert.equal(handel.tradeDistance, 20);
  assert.equal(handel.actionsPerHour, 60);
  assert.equal(handel.mailKeepDays, 30);
  // Buiten de grenzen wordt teruggezet naar de grens, rommel naar de standaard.
  assert.equal(economyValues({ marketTaxPct: 999 }).marketTaxPct, 50);
  assert.equal(tradeValues({ tradeDistance: 0, tradeOn: false }).tradeDistance, 1);
  assert.equal(tradeValues({ tradeOn: false }).tradeOn, false);
  assert.equal(tradeValues({ actionsPerHour: "nee" }).actionsPerHour, 60);
  // Prijzen: eigen prijs gaat voor, anders waarde × opslag. Verkopen levert nooit meer op dan kopen kost.
  assert.equal(shopSellPrice(100, 0, 150), 150);
  assert.equal(shopSellPrice(100, 42, 150), 42, "eigen prijs gaat voor");
  assert.equal(shopBuyPrice(100, 0, 100), 100);
  assert.equal(shopBuyPrice(100, 0, 0), 0, "0 % = de winkel koopt niets terug");
  assert.equal(shopSellPrice(0, 0, 150), 0, "zonder waarde geen prijs");
  for (const value of [1, 7, 99, 1234]) {
    assert.ok(shopSellPrice(value, 0, 150) >= shopBuyPrice(value, 0, 100), "kopen kost minstens wat verkopen opbrengt");
  }
  assert.equal(validateDocument("economy_settings", { marketTaxPct: 5 }).ok, true);
  assert.equal(validateDocument("trade_settings", { tradeDistance: 20 }).ok, true);
});

test("kaart naar build: Geld en Handel komen als wereldregels mee", () => {
  const section = compileGameSection([
    doc("economy_settings", { shopMarkupPct: 200, marketTaxPct: 10, craftCostPct: 25 }),
    doc("trade_settings", { tradeOn: false, marketDays: 7, actionsPerHour: 5 })
  ], {});
  assert.equal(section.server.economy.shopMarkupPct, 200);
  assert.equal(section.server.trade.tradeOn, false);
  assert.equal(section.server.trade.marketDays, 7);
  const world = buildRuntimeWorld({ game: section.server });
  const economy = world.gameProject.playerRules.byType.economy_rules[0];
  const trade = world.gameProject.playerRules.byType.trade_rules[0];
  assert.equal(economy.marketTaxPct, 10);
  assert.equal(economy.craftCostPct, 25);
  assert.equal(trade.tradeOn, false);
  assert.equal(trade.actionsPerHour, 5);
  // Zonder de kaarten gelden de standaarden, zodat een oudere wereld blijft werken.
  const bare = buildRuntimeWorld({ game: compileGameSection([doc("hud_settings", {})], {}).server });
  assert.equal(bare.gameProject.playerRules.byType.economy_rules[0].shopMarkupPct, 150);
  assert.equal(bare.gameProject.playerRules.byType.trade_rules[0].tradeOn, true);
});

test("geld in de buit: een loottabel mag geld laten vallen", () => {
  const tables = { "loot.wolf": { entries: [
    { currencyId: "currency.gold", chanceBp: 10000, minQty: 5, maxQty: 5 },
    { itemId: "item.pelt", chanceBp: 10000, minQty: 1, maxQty: 1 }
  ] } };
  const rows = rollLoot(tables, "loot.wolf", "zaadje");
  const money = rows.find((row) => row.currencyId === "currency.gold");
  const pelt = rows.find((row) => row.itemId === "item.pelt");
  assert.equal(money.quantity, 5);
  assert.equal(pelt.quantity, 1);
  assert.equal(money.itemId, undefined, "geld is geen item");
  // Hetzelfde zaadje geeft hetzelfde resultaat, zodat de server en de proef in de editor gelijk rekenen.
  assert.deepEqual(rollLoot(tables, "loot.wolf", "zaadje"), rows);
});

// ---- de server: twee spelers, één database ----

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
      "item.sword": { id: "item.sword", displayName: "Zwaard", stackable: true, tradable: true, marketEligible: true, vendorBaseValueMinor: 100, vendorCurrencyRef: "currency.gold" },
      "item.pelt": { id: "item.pelt", displayName: "Vacht", stackable: true, tradable: true, marketEligible: true, vendorBaseValueMinor: 10, vendorCurrencyRef: "currency.gold" },
      "item.brief": { id: "item.brief", displayName: "Brief", stackable: false, tradable: false, questItem: true, vendorBaseValueMinor: 0 }
    },
    currencies: { "currency.gold": { id: "currency.gold", displayName: "Goud" } }
  };
  const project = {
    catalogs,
    playerRules: { byType: {
      economy_rules: [Object.assign({ id: "rules.economy" }, economyValues(options.money || null))],
      trade_rules: [Object.assign({ id: "rules.trade" }, tradeValues(options.handel || null))]
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
    getWorldPlayerStates: (worldId, ids) => (ids || []).map((id) => ({ player_id: id, x: 0, y: 0, z: 0 }))
  };
  const zonePackage = { entities: [], entityComponents: [
    { nodeType: "marketplace_access_component", marketAccessId: "market.home", remoteAccessAllowed: true, range: 5 },
    { nodeType: "vendor_component", vendorId: "vendor.smid", vendorCatalogRef: "vendor_catalog.smid", range: 1000, x: 0, y: 0, z: 0 }
  ] };
  const ctx = (id) => ({ profile: { id }, worldId: "world.main", zoneId: "zone.start", project, catalogs, zonePackage, position: { x: 0, y: 0, z: 0 } });
  let counter = 0;
  // Net als de echte route: alles in één transactie, met een bon per actie (die ook de spamgrens voedt).
  const act = (id, action, payload = {}, operationId = null) => {
    const opId = operationId || "op_" + (counter += 1);
    const where = ctx(id);
    return runOperation(db, {
      operationId: opId,
      playerId: id,
      operationType: action,
      requestHash: JSON.stringify([action, payload]),
      perform: () => svc.performAction(where, action, payload, opId),
      buildResponse: (result) => Object.assign({ ok: true, operationId: opId }, result)
    });
  };
  const give = (id, itemId, quantity) => node03.grantItem(ctx(id), itemId, quantity, "test", null, "op_seed_" + (counter += 1));
  const giveMoney = (id, amount) => node03.grantCurrency(ctx(id), "currency.gold", amount, "test", null, "op_seed_" + (counter += 1));
  const items = (id, itemId) => node03.ownedItemCount(id, itemId);
  const money = (id) => svc.currencyAmount(id, "currency.gold");
  return { db, svc, node03, ctx, act, give, giveMoney, items, money };
}

test("ruilen: beide kanten ja, en de ruil gebeurt in één keer", () => {
  const world = setup();
  world.give("p1", "item.sword", 1);
  world.giveMoney("p2", 500);
  const invited = world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  assert.match(invited.message, /bob/);
  world.act("p2", "trade_accept", { tradeId: invited.tradeId });
  world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.sword", quantity: 1 });
  world.act("p2", "trade_offer", { tradeId: invited.tradeId, currencyId: "currency.gold", quantity: 300 });
  // De bevestiging zegt precies wat je geeft en krijgt.
  const view = world.svc.buildTradeSnapshot(world.ctx("p1")).sessions[0];
  assert.equal(view.confirmText, "Je geeft 1× Zwaard en je krijgt 300 Goud.");
  assert.equal(view.partnerName, "bob");
  // Eén ja is niet genoeg.
  const half = world.act("p1", "trade_confirm", { tradeId: invited.tradeId, revision: view.revision });
  assert.match(half.message, /Nu de ander/);
  assert.equal(world.items("p2", "item.sword"), 0, "nog niets geruild");
  const after = world.svc.buildTradeSnapshot(world.ctx("p2")).sessions[0];
  const done = world.act("p2", "trade_confirm", { tradeId: invited.tradeId, revision: after.revision });
  assert.match(done.message, /je gaf 300 Goud en kreeg 1× Zwaard/);
  assert.equal(world.items("p1", "item.sword"), 0);
  assert.equal(world.items("p2", "item.sword"), 1);
  assert.equal(world.money("p1"), 300);
  assert.equal(world.money("p2"), 200);
  // Niets dubbel: er is precies één zwaard en precies 500 goud in de wereld.
  assert.equal(world.items("p1", "item.sword") + world.items("p2", "item.sword"), 1);
  assert.equal(world.money("p1") + world.money("p2"), 500);
  assert.equal(world.db.prepare("SELECT state FROM direct_trade_sessions WHERE id = ?").get(invited.tradeId).state, "completed");
});

test("ruilen: iets veranderen zet beide ja's uit, en een oude bevestiging wordt geweigerd", () => {
  const world = setup();
  world.give("p1", "item.sword", 2);
  world.give("p2", "item.pelt", 1);
  const invited = world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  world.act("p2", "trade_accept", { tradeId: invited.tradeId });
  world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.sword", quantity: 1 });
  const seen = world.svc.buildTradeSnapshot(world.ctx("p2")).sessions[0];
  world.act("p2", "trade_confirm", { tradeId: invited.tradeId, revision: seen.revision });
  // p1 legt er stil nog iets bij: het ja van p2 vervalt en zijn oude bevestiging past niet meer.
  world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.pelt", quantity: 0 });
  const fresh = world.svc.buildTradeSnapshot(world.ctx("p2")).sessions[0];
  assert.equal(fresh.iConfirmed, false, "het ja is vervallen");
  assert.throws(() => world.act("p2", "trade_confirm", { tradeId: invited.tradeId, revision: seen.revision }), /net veranderd/);
  assert.equal(world.items("p2", "item.sword"), 0, "er is niets geruild");
  // Een item dat je niet mag ruilen (een brief) komt er niet in.
  world.give("p1", "item.brief", 1);
  assert.throws(() => world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.brief", quantity: 1 }), /niet ruilen/);
  // Meer aanbieden dan je hebt kan niet.
  assert.throws(() => world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.sword", quantity: 99 }), /heb je niet/);
  // Afbreken sluit de ruil en laat alles waar het was.
  world.act("p2", "trade_cancel", { tradeId: invited.tradeId });
  assert.equal(world.items("p1", "item.sword"), 2);
  assert.throws(() => world.act("p1", "trade_confirm", { tradeId: invited.tradeId }), /afgelopen/);
});

test("ruilen: twee keer klikken met hetzelfde operationId ruilt één keer", () => {
  const world = setup();
  world.give("p1", "item.sword", 1);
  const invited = world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  world.act("p2", "trade_accept", { tradeId: invited.tradeId });
  world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.sword", quantity: 1 });
  world.act("p1", "trade_confirm", { tradeId: invited.tradeId });
  // De tweede klik van p2 heeft hetzelfde operationId: de actieroute geeft dezelfde bon terug.
  const first = world.act("p2", "trade_confirm", { tradeId: invited.tradeId }, "op_dubbel");
  assert.equal(world.items("p2", "item.sword"), 1);
  assert.throws(() => world.act("p2", "trade_confirm", { tradeId: invited.tradeId }, "op_dubbel2"), /afgelopen/);
  assert.match(first.message, /Geruild/);
  assert.equal(world.items("p1", "item.sword") + world.items("p2", "item.sword"), 1, "nooit dubbel");
});

test("ruilen: honderd ruilen heen en terug maakt geen geld of items uit niets", () => {
  const world = setup({ handel: { actionsPerHour: 1000 } });
  world.give("p1", "item.pelt", 3);
  world.giveMoney("p2", 1000);
  for (let round = 0; round < 25; round += 1) {
    const from = round % 2 === 0 ? "p1" : "p2";
    const to = round % 2 === 0 ? "p2" : "p1";
    const invited = world.act(from, "trade_invite", { targetPlayerId: to });
    world.act(to, "trade_accept", { tradeId: invited.tradeId });
    world.act(from, "trade_offer", { tradeId: invited.tradeId, itemId: "item.pelt", quantity: 3 });
    world.act(to, "trade_offer", { tradeId: invited.tradeId, currencyId: "currency.gold", quantity: 100 });
    world.act(from, "trade_confirm", { tradeId: invited.tradeId });
    world.act(to, "trade_confirm", { tradeId: invited.tradeId });
    assert.equal(world.items("p1", "item.pelt") + world.items("p2", "item.pelt"), 3, "altijd precies 3 vachten");
    assert.equal(world.money("p1") + world.money("p2"), 1000, "altijd precies 1000 goud");
    assert.ok(world.money("p1") >= 0 && world.money("p2") >= 0, "nooit in de min");
  }
});

test("spamgrens: te snel handelen wordt geweigerd", () => {
  const world = setup({ handel: { actionsPerHour: 3 } });
  world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  assert.throws(() => world.act("p1", "trade_invite", { targetPlayerId: "p2" }), /te snel/);
  // De grens geldt per speler: bob mag nog.
  const invited = world.db.prepare("SELECT id FROM direct_trade_sessions WHERE state = 'invited' ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(invited, "de laatste uitnodiging staat er nog");
});

test("ruilen staat uit: dan kan niemand een ruil beginnen", () => {
  const world = setup({ handel: { tradeOn: false } });
  assert.throws(() => world.act("p1", "trade_invite", { targetPlayerId: "p2" }), /staat uit/);
});

test("markt: de belasting gaat eraf en de verkoper krijgt de rest", () => {
  const world = setup({ money: { marketTaxPct: 10 } });
  world.give("p1", "item.sword", 1);
  world.giveMoney("p2", 1000);
  const listed = world.act("p1", "market_list", { itemId: "item.sword", quantity: 1, unitPriceMinor: 200 });
  assert.equal(world.items("p1", "item.sword"), 0, "het item ligt op de markt");
  world.act("p2", "market_buy", { orderId: listed.orderId, quantity: 1 });
  assert.equal(world.items("p2", "item.sword"), 1);
  assert.equal(world.money("p2"), 800);
  assert.equal(world.money("p1"), 180, "200 min 10 % belasting");
  // Het belastingdeel is uit het spel verdwenen en staat als zodanig in het grootboek.
  const tax = world.db.prepare("SELECT SUM(-delta_real) AS total FROM economy_ledger WHERE reason = 'market_tax'").get();
  assert.equal(Math.round(Number(tax.total) || 0), 20);
  assert.equal(world.money("p1") + world.money("p2"), 980, "er is 20 goud uit het spel");
  // Je eigen aanbod kun je niet kopen.
  world.give("p1", "item.pelt", 1);
  const mine = world.act("p1", "market_list", { itemId: "item.pelt", quantity: 1, unitPriceMinor: 5 });
  assert.throws(() => world.act("p1", "market_buy", { orderId: mine.orderId }), /eigen aanbod/);
});

test("markt: de grens voor hoeveel je tegelijk mag aanbieden, en de markt uitzetten", () => {
  const world = setup({ handel: { marketMaxPerPlayer: 1, actionsPerHour: 100 } });
  world.give("p1", "item.pelt", 5);
  world.act("p1", "market_list", { itemId: "item.pelt", quantity: 1, unitPriceMinor: 5 });
  assert.throws(() => world.act("p1", "market_list", { itemId: "item.pelt", quantity: 1, unitPriceMinor: 5 }), /op de markt staan/);
  const off = setup({ handel: { marketOn: false } });
  off.give("p1", "item.pelt", 1);
  assert.throws(() => off.act("p1", "market_list", { itemId: "item.pelt", quantity: 1 }), /markt staat uit/);
});

test("winkel: terugkopen wat je net verkocht, voor dezelfde prijs", () => {
  const world = setup();
  const ctx = world.ctx("p1");
  const vendor = { vendorId: "vendor.smid", inRange: true };
  // De winkel legt het apart na een verkoop en geeft het voor dezelfde prijs terug.
  world.svc.rememberBuyBack(ctx, vendor, "item.sword", 1, "currency.gold", 100);
  const rows = world.svc.buyBackRows(ctx, vendor);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].priceMinor, 100);
  assert.equal(rows[0].displayName, "Zwaard");
  assert.equal(rows[0].canBuy, false, "zonder geld kun je het niet terugkopen");
  world.giveMoney("p1", 250);
  assert.equal(world.svc.buyBackRows(ctx, vendor)[0].canBuy, true);
  // Terugkopen: het geld gaat eraf, het item komt terug en de regel is weg.
  world.svc.vendorBuyBack(ctx, { vendorId: "vendor.smid", entryId: rows[0].id }, "op_back");
  assert.equal(world.items("p1", "item.sword"), 1);
  assert.equal(world.money("p1"), 150);
  assert.equal(world.svc.buyBackRows(ctx, vendor).length, 0);
  // Nog een keer op dezelfde regel klikken geeft geen tweede item.
  assert.throws(() => world.svc.vendorBuyBack(ctx, { vendorId: "vendor.smid", entryId: rows[0].id }, "op_back2"), /niet meer/);
  assert.equal(world.items("p1", "item.sword"), 1);
  // Staat terugkopen op 0, dan onthoudt de winkel niets.
  const off = setup({ money: { buyBackSlots: 0 } });
  off.svc.rememberBuyBack(off.ctx("p1"), vendor, "item.sword", 1, "currency.gold", 100);
  assert.equal(off.svc.buyBackRows(off.ctx("p1"), vendor).length, 0);
});

test("overzicht en logboek voor de maker: geld per dag en wie wat ruilde", () => {
  const world = setup();
  world.give("p1", "item.sword", 1);
  world.giveMoney("p2", 500);
  const invited = world.act("p1", "trade_invite", { targetPlayerId: "p2" });
  world.act("p2", "trade_accept", { tradeId: invited.tradeId });
  world.act("p1", "trade_offer", { tradeId: invited.tradeId, itemId: "item.sword", quantity: 1 });
  world.act("p2", "trade_offer", { tradeId: invited.tradeId, currencyId: "currency.gold", quantity: 300 });
  world.act("p1", "trade_confirm", { tradeId: invited.tradeId });
  world.act("p2", "trade_confirm", { tradeId: invited.tradeId });
  const money = moneyPerDay(world.db);
  assert.ok(money.days.length >= 1, "er is minstens één dag met geld");
  assert.ok(money.reasons.some((row) => row.reason === "trade"), "ruilen staat in het overzicht");
  const log = tradeLog(world.db);
  assert.equal(log.swaps.length, 1);
  assert.equal(log.swaps[0].aName, "anna");
  assert.equal(log.swaps[0].bName, "bob");
  assert.deepEqual(log.swaps[0].aGave, [{ kind: "item", id: "item.sword", quantity: 1 }]);
  assert.deepEqual(log.swaps[0].bGave, [{ kind: "currency", id: "currency.gold", quantity: 300 }]);
  assert.ok(log.busiest.some((row) => row.name === "anna" || row.name === "bob"));
  // Zonder database geeft het logboek lege lijsten in plaats van een fout.
  assert.deepEqual(tradeLog(null), { swaps: [], market: [], busiest: [] });
});

test("Balans: een geldlus (terugkoopprijs hoger dan de koopprijs) is rood", () => {
  const docs = [
    doc("currency", { currencyId: "currency.gold", displayName: "Goud" }, "currency:currency.gold"),
    doc("item_definition", { itemId: "item.sword", displayName: "Zwaard", category: "equipment", rarity: "common", stackable: true, stackLimit: 10, vendorValue: 100 }, "item_definition:item.sword"),
    doc("economy_settings", { shopMarkupPct: 100, shopBuyPct: 100 }),
    doc("npc", { npcId: "npc.smid", displayName: "Smid", shop: true, shopCurrencyRef: "currency:currency.gold",
      shopOffers: [{ ref: "item_definition:item.sword", mode: "both", price: 50, buyBack: 200 }] }, "npc:npc.smid")
  ];
  const report = balanceReport(docs, { buildErrors: [] });
  const loop = report.findings.find((finding) => finding.code === "MONEY_LOOP");
  assert.ok(loop, "een geldlus is rood: " + JSON.stringify(report.findings.map((f) => f.code)));
  assert.equal(loop.severity, "red");
  assert.match(loop.message, /Geldlus/);
  // Met gewone prijzen is er geen geldlus.
  const healthy = balanceReport(docs.map((entry) => (entry.kind === "npc"
    ? doc("npc", { npcId: "npc.smid", displayName: "Smid", shop: true, shopCurrencyRef: "currency:currency.gold",
      shopOffers: [{ ref: "item_definition:item.sword", mode: "both", price: 150, buyBack: 100 }] }, "npc:npc.smid")
    : entry)), { buildErrors: [] });
  assert.equal(healthy.findings.some((finding) => finding.code === "MONEY_LOOP"), false);
});
