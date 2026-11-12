// Werkbank Fase 8, herstel na Kevins handtest (12-11).
// E: ruilen en terugkopen kwamen nooit bij de server aan (velden vielen onderweg weg).
// C: verkopen bij de handelaar (uit je tas, ook wat de winkel zelf niet verkoopt).
// F: een markt bij een NPC (vinkje op de NPC-kaart) en post tussen spelers.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { economyValues } from "../src/shared/authoring/kinds/economy.js";
import { tradeValues } from "../src/shared/authoring/kinds/trade.js";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { buildRuntimeWorld, WORLD_ZONE_ID } from "../src/server/authoring/world-builder.js";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { Node05EconomyRuntimeService } from "../src/server/node05-economy-runtime-service.js";
import { runOperation } from "../src/server/persistence/operation-contract.js";
import { NODE05_NUMBER_FIELDS, NODE05_TEXT_FIELDS, node05ActionBody } from "../apps/web/public/game/node05-request.js";

// ---- E: wat de HUD meestuurt, moet ook echt bij de server aankomen ----

function run05Keys(source) {
  const keys = new Set();
  let at = source.indexOf("api.run05(");
  while (at >= 0) {
    // De hele aanroep tot het sluitende haakje.
    let depth = 0;
    let end = at + "api.run05".length;
    for (; end < source.length; end += 1) {
      if (source[end] === "(") depth += 1;
      else if (source[end] === ")") { depth -= 1; if (depth === 0) break; }
    }
    const call = source.slice(at, end);
    for (const match of call.matchAll(/[{,]\s*([A-Za-z_]\w*)\s*(?=[:,}])/g)) keys.add(match[1]);
    at = source.indexOf("api.run05(", end);
  }
  return keys;
}

test("HUD-acties: elk veld dat de HUD meestuurt komt bij de server aan", () => {
  const hud = fs.readFileSync("apps/web/public/game/hud/gk-hud.js", "utf8");
  const keys = run05Keys(hud);
  // Zeker weten dat het zoeken werkt: ruilen, terugkopen, markt en post staan erin.
  for (const key of ["tradeId", "revision", "entryId", "marketId", "orderId", "mailId", "toName", "amountMinor", "unitPriceMinor"]) {
    assert.ok(keys.has(key), "de HUD stuurt " + key);
  }
  const known = new Set(NODE05_TEXT_FIELDS.concat(NODE05_NUMBER_FIELDS));
  const missing = Array.from(keys).filter((key) => !known.has(key));
  assert.deepEqual(missing, [], "deze velden vallen onderweg weg: " + missing.join(", "));
  // De game gebruikt de gedeelde lijst (geen eigen lijstje meer dat kan achterlopen).
  const game = fs.readFileSync("apps/web/public/game/game.js", "utf8");
  assert.match(game, /node05ActionBody\(normalized, payload/);
  // 0 blijft 0 (een item uit de ruil halen), leeg wordt null, tekst blijft tekst.
  const body = node05ActionBody("node05:TRADE_OFFER", { tradeId: "trade_1", itemId: "item.pelt", quantity: 0, revision: 3, toName: "", junk: "x" }, "op_1");
  assert.equal(body.action, "trade_offer");
  assert.equal(body.tradeId, "trade_1");
  assert.equal(body.quantity, 0);
  assert.equal(body.revision, 3);
  assert.equal(body.toName, null);
  assert.equal(body.amountMinor, null);
  assert.equal(body.operationId, "op_1");
  assert.equal("junk" in body, false, "alleen bekende velden gaan mee");
});

// ---- de server: twee spelers, een winkel en een markt bij een NPC ----

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
      "item.sword": { id: "item.sword", displayName: "Zwaard", stackable: true, tradable: true, vendorBaseValueMinor: 100 },
      "item.pelt": { id: "item.pelt", displayName: "Vacht", stackable: true, tradable: true, vendorBaseValueMinor: 10 },
      "item.stone": { id: "item.stone", displayName: "Steen", stackable: true, tradable: true, vendorBaseValueMinor: 0 },
      "item.ring": { id: "item.ring", displayName: "Ring", stackable: true, tradable: true, unique: true, vendorBaseValueMinor: 50 },
      "item.brief": { id: "item.brief", displayName: "Brief", stackable: false, tradable: false, questItem: true, category: "quest" }
    },
    currencies: { "currency.gold": { id: "currency.gold", displayName: "Goud" } },
    vendorCatalogs: { "vendor_catalog.npc.smid": { id: "vendor_catalog.npc.smid", displayName: "Smid", currencyRef: "currency.gold", offers: [
      { offerId: "offer.npc.smid.item.sword", itemRef: "item.sword", mode: "sell_to_player", sellCurrencyRef: "currency.gold", sellPriceMinor: 0, buyCurrencyRef: "currency.gold", buyPriceMinor: 0, stockMode: "infinite" },
      { offerId: "offer.npc.smid.item.pelt", itemRef: "item.pelt", mode: "both", sellCurrencyRef: "currency.gold", sellPriceMinor: 20, buyCurrencyRef: "currency.gold", buyPriceMinor: 7, stockMode: "infinite" }
    ] } }
  };
  const project = {
    catalogs,
    playerRules: { byType: {
      economy_rules: [Object.assign({ id: "rules.economy" }, economyValues(options.money || null))],
      trade_rules: [Object.assign({ id: "rules.trade" }, tradeValues(Object.assign({ actionsPerHour: 1000 }, options.handel || {})))]
    } }
  };
  const online = new Set(["p1", "p2"]);
  const pushes = [];
  const positions = new Map();
  const node03 = Object.create(Node03RuntimeService.prototype);
  node03.db = db;
  const svc = Object.create(Node05EconomyRuntimeService.prototype);
  svc.db = db;
  svc.node03RuntimeService = node03;
  svc.mmoService = {
    getConnectionForPlayer: (playerId) => (online.has(playerId) ? { playerId } : null),
    countConnectedPlayerSessions: (playerId) => (online.has(playerId) ? 1 : 0),
    getWorldPlayerStates: (worldId, ids) => (ids || []).map((id) => Object.assign({ player_id: id, x: 0, y: 0, z: 0 }, positions.get(id) || {})),
    sendToPlayer: (playerId, payload) => { pushes.push({ to: playerId, payload }); return true; },
    chatRuntime: options.blocked ? { hasBlocked: (playerId, otherId) => options.blocked.some(([a, b]) => a === playerId && b === otherId) } : null
  };
  // Zoals de build het maakt: de smid (winkel) en Mia (vinkje Markt), allebei vlak bij de start.
  const zonePackage = { entities: [
    { nodeType: "model_entity", entityId: "npc_entity.npc.smid", x: 0, y: 0, z: 0, components: [
      { nodeType: "vendor_component", componentId: "vendor.npc.smid", vendorId: "vendor.npc.smid", vendorCatalogRef: "vendor_catalog.npc.smid", range: 3 }
    ] },
    { nodeType: "model_entity", entityId: "npc_entity.npc.mia", x: 2, y: 0, z: 0, components: [
      { nodeType: "marketplace_access_component", componentId: "market.npc.mia", marketAccessId: "market.npc.mia", range: 3, interactionPrompt: "Markt", remoteAccessAllowed: false }
    ] }
  ], entityComponents: [] };
  const ctx = (id) => {
    const profile = db.prepare("SELECT * FROM player_profiles WHERE id = ? LIMIT 1").get(id);
    return { profile, worldId: "world.main", zoneId: "zone.start", project, catalogs, zonePackage, position: Object.assign({ x: 0, y: 0, z: 0 }, positions.get(id) || {}) };
  };
  let counter = 0;
  // Net als de echte route: alles in één transactie, met een bon per actie.
  const act = (id, action, payload = {}) => {
    const opId = "op_" + (counter += 1);
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
  const items = (id, itemId) => svc.bagCount(id, itemId);
  const money = (id) => svc.currencyAmount(id, "currency.gold");
  return { db, svc, node03, ctx, act, give, giveMoney, items, money, online, pushes, positions };
}

test("winkel: verkopen uit je tas, ook wat de winkel zelf niet verkoopt", () => {
  const world = setup();
  world.give("p1", "item.pelt", 3);
  world.give("p1", "item.sword", 2);
  world.give("p1", "item.ring", 1);
  world.give("p1", "item.stone", 1);
  world.give("p1", "item.brief", 1);
  const vendor = world.svc.findVendor(world.ctx("p1"), "vendor.npc.smid");
  // Wat de winkel betaalt: een eigen terugkoopprijs gaat voor (vacht 7), anders de Verkoopwaarde × 100 %.
  const list = Object.fromEntries(world.svc.bagSellList(world.ctx("p1"), vendor).map((row) => [row.itemId, row]));
  assert.equal(list["item.pelt"].priceMinor, 7);
  assert.equal(list["item.pelt"].ownPrice, true);
  assert.equal(list["item.sword"].priceMinor, 100);
  assert.equal(list["item.ring"].priceMinor, 50, "staat niet in de winkel en mag toch verkocht worden");
  assert.equal(list["item.stone"].canSell, false);
  assert.match(list["item.stone"].why, /Verkoopwaarde/);
  assert.equal(list["item.brief"].canSell, false);
  assert.match(list["item.brief"].why, /questitem/);
  // Verkopen gaat op itemId (uit je tas).
  const sold = world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.pelt", quantity: 2 });
  assert.match(sold.message, /Verkocht: 2× Vacht voor 14 Goud/);
  assert.equal(world.money("p1"), 14);
  // Meer vragen dan je hebt: je verkoopt wat er nog is.
  world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.pelt", quantity: 99 });
  assert.equal(world.items("p1", "item.pelt"), 0);
  assert.equal(world.money("p1"), 21);
  world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.ring", quantity: 1 });
  assert.equal(world.money("p1"), 71);
  // Een oude knop met alleen een offerId werkt ook nog.
  world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", offerId: "offer.npc.smid.item.sword", quantity: 1 });
  assert.equal(world.items("p1", "item.sword"), 1);
  assert.equal(world.money("p1"), 171);
  assert.throws(() => world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.stone" }), /Verkoopwaarde/);
  assert.throws(() => world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.brief" }), /questitem/);
  assert.equal(world.items("p1", "item.brief"), 1, "de brief blijft in je tas");
  // Terugkopen: het zwaard ligt bij de winkel voor dezelfde prijs.
  const back = world.svc.buyBackRows(world.ctx("p1"), vendor).find((row) => row.itemId === "item.sword");
  assert.equal(back.priceMinor, 100);
  world.act("p1", "vendor_buy_back", { vendorId: "vendor.npc.smid", entryId: back.id });
  assert.equal(world.items("p1", "item.sword"), 2);
  assert.equal(world.money("p1"), 71);
  // Te ver van de winkel: niet verkopen.
  world.positions.set("p1", { x: 40, z: 40 });
  assert.throws(() => world.act("p1", "vendor_sell", { vendorId: "vendor.npc.smid", itemId: "item.sword" }), /te ver weg/);
});

test("NPC-kaart met vinkje Markt: na de build staat er een markt bij die NPC", () => {
  const body = { npcId: "npc.mia", displayName: "Mia", market: true, x: 3, y: 0, z: 3 };
  assert.equal(validateDocument("npc", body).ok, true);
  const section = compileGameSection([{ docKey: "npc:npc.mia", kind: "npc", archived: false, body }], {});
  const world = buildRuntimeWorld({ game: section.server });
  const zone = world.gameProject.zones.byId[WORLD_ZONE_ID];
  const components = (zone.entities || []).flatMap((entity) => entity.components || []).concat(zone.entityComponents || []);
  const market = components.find((component) => component.nodeType === "marketplace_access_component");
  assert.ok(market, "er staat een markt bij Mia");
  assert.equal(market.marketAccessId, "market.npc.mia");
  assert.equal(market.remoteAccessAllowed, false, "je moet bij Mia staan");
  // Zonder vinkje geen markt.
  const plain = buildRuntimeWorld({ game: compileGameSection([{ docKey: "npc:npc.mia", kind: "npc", archived: false, body: Object.assign({}, body, { market: false }) }], {}).server });
  const plainZone = plain.gameProject.zones.byId[WORLD_ZONE_ID];
  assert.equal((plainZone.entities || []).flatMap((entity) => entity.components || []).some((component) => component.nodeType === "marketplace_access_component"), false);
});

test("markt bij een NPC: prijs verplicht, koper betaalt, verkoper krijgt het (offline per post), verlopen komt terug", () => {
  const world = setup();
  world.give("p1", "item.pelt", 3);
  world.give("p1", "item.brief", 1);
  world.giveMoney("p2", 100);
  assert.throws(() => world.act("p1", "market_list", { marketId: "market.npc.mia", itemId: "item.pelt", quantity: 2 }), /prijs/);
  assert.throws(() => world.act("p1", "market_list", { marketId: "market.npc.mia", itemId: "item.brief", quantity: 1, unitPriceMinor: 5 }), /niet op de markt/);
  const listed = world.act("p1", "market_list", { marketId: "market.npc.mia", itemId: "item.pelt", quantity: 2, unitPriceMinor: 30 });
  assert.match(listed.message, /Op de markt: 2× Vacht voor 30 Goud per stuk/);
  assert.equal(world.items("p1", "item.pelt"), 1, "twee vachten liggen op de markt");
  // Bob ziet het aanbod, Anna ziet het bij Mijn aanbod.
  const seen = world.svc.buildMarketSnapshot(world.ctx("p2"));
  assert.equal(seen.orders.length, 1);
  assert.equal(world.svc.buildMarketSnapshot(world.ctx("p1")).myOrders.length, 1);
  // Anna is online: ze krijgt meteen haar hele 30 en een seintje. Bob betaalt 30 + 5 % belasting (afgerond 2) = 32.
  const bought = world.act("p2", "market_buy", { marketId: "market.npc.mia", orderId: listed.orderId, quantity: 1 });
  assert.deepEqual(bought.notify, ["p1"]);
  assert.match(bought.message, /voor 32 Goud \(30 \+ 2 marktbelasting\)/);
  assert.equal(world.money("p2"), 68);
  assert.equal(world.money("p1"), 30);
  assert.equal(world.items("p2", "item.pelt"), 1);
  // Anna is offline: het geld komt met de post.
  world.online.delete("p1");
  world.act("p2", "market_buy", { marketId: "market.npc.mia", orderId: listed.orderId, quantity: 1 });
  assert.equal(world.money("p2"), 36);
  assert.equal(world.money("p1"), 30, "nog niet in de beurs");
  const mail = world.svc.buildMailSnapshot(world.ctx("p1"));
  assert.equal(mail.messages[0].subject, "Verkocht op de markt");
  world.act("p1", "mail_claim", { mailId: mail.messages[0].mailId || mail.messages[0].id });
  assert.equal(world.money("p1"), 60);
  // Te ver van Mia: niet kopen.
  world.give("p1", "item.sword", 1);
  const sword = world.act("p1", "market_list", { marketId: "market.npc.mia", itemId: "item.sword", quantity: 1, unitPriceMinor: 10 });
  world.positions.set("p2", { x: 50, z: 50 });
  assert.throws(() => world.act("p2", "market_buy", { marketId: "market.npc.mia", orderId: sword.orderId }), /te ver weg/);
  // De tijd is om: het zwaard gaat met de post terug naar Anna.
  world.db.prepare("UPDATE market_orders SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), sword.orderId);
  world.svc.buildMarketSnapshot(world.ctx("p1"));
  assert.equal(world.db.prepare("SELECT status FROM market_orders WHERE id = ?").get(sword.orderId).status, "expired");
  const returned = world.svc.buildMailSnapshot(world.ctx("p1")).messages.find((row) => row.subject === "Terug van de markt");
  assert.ok(returned, "bericht 'Terug van de markt'");
  world.act("p1", "mail_claim", { mailId: returned.mailId || returned.id });
  assert.equal(world.items("p1", "item.sword"), 1, "het zwaard is terug");
});

test("post: sturen met spullen en geld, ophalen, en wat niet mag", () => {
  const world = setup({ blocked: [] });
  world.give("p1", "item.pelt", 2);
  world.give("p1", "item.brief", 1);
  world.giveMoney("p1", 100);
  // Aan een naam (hoofdletters maken niet uit). Wat je meestuurt gaat meteen uit je tas.
  const sent = world.act("p1", "mail_send", { toName: "BOB", text: "Hoi Bob", itemId: "item.pelt", quantity: 2, currencyId: "currency.gold", amountMinor: 40 });
  assert.match(sent.message, /Post verstuurd naar bob met 2× Vacht en 40 Goud/);
  assert.deepEqual(sent.notify, ["p2"]);
  assert.equal(world.items("p1", "item.pelt"), 0);
  assert.equal(world.money("p1"), 60);
  const box = world.svc.buildMailSnapshot(world.ctx("p2"));
  assert.equal(box.unreadCount, 1);
  const message = box.messages[0];
  assert.equal(message.fromName, "anna");
  assert.equal(message.canClaim, true);
  const mailId = message.mailId || message.id;
  assert.throws(() => world.act("p2", "mail_delete", { mailId }), /Haal eerst op/);
  world.act("p2", "mail_claim", { mailId });
  assert.equal(world.items("p2", "item.pelt"), 2);
  assert.equal(world.money("p2"), 40);
  world.act("p2", "mail_delete", { mailId });
  // Niets dubbel: precies 2 vachten en 100 goud in de wereld.
  assert.equal(world.items("p1", "item.pelt") + world.items("p2", "item.pelt"), 2);
  assert.equal(world.money("p1") + world.money("p2"), 100);
  // Wat niet mag.
  assert.throws(() => world.act("p1", "mail_send", { toName: "anna", text: "x" }), /jezelf/);
  assert.throws(() => world.act("p1", "mail_send", { toName: "niemand", text: "x" }), /geen speler/);
  assert.throws(() => world.act("p1", "mail_send", { toName: "bob", itemId: "item.brief", quantity: 1 }), /niet versturen/);
  assert.throws(() => world.act("p1", "mail_send", { toName: "bob", itemId: "item.pelt", quantity: 5 }), /heb je niet/);
  assert.throws(() => world.act("p1", "mail_send", { toName: "bob" }), /Schrijf iets/);
  assert.equal(world.money("p1"), 60, "een geweigerde post kost niets");
  const off = setup({ handel: { mailOn: false } });
  assert.throws(() => off.act("p1", "mail_send", { toName: "bob", text: "x" }), /staat uit/);
  const full = setup({ handel: { mailMax: 1 } });
  full.act("p1", "mail_send", { toName: "bob", text: "een" });
  assert.throws(() => full.act("p1", "mail_send", { toName: "bob", text: "twee" }), /vol/);
  const blocked = setup({ blocked: [["p2", "p1"]] });
  assert.throws(() => blocked.act("p1", "mail_send", { toName: "bob", text: "x" }), /wil geen post/);
});

test("post: één postbus per account, en een uniek item dat je al hebt blijft liggen", () => {
  const world = setup();
  // Bob heeft een tweede character en speelt daar nu mee.
  const stamp = new Date().toISOString();
  world.db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p3', 'up2', 'bob', 'class.healer', 'world.main', ?, ?)").run(stamp, stamp);
  world.db.prepare("UPDATE users SET active_profile_id = 'p3' WHERE id = 'up2'").run();
  world.give("p1", "item.ring", 1);
  world.give("p3", "item.ring", 1);
  world.act("p1", "mail_send", { toName: "bob", itemId: "item.ring", quantity: 1 });
  // De post gaat naar het character waarmee Bob speelt; zijn andere character ziet dezelfde postbus.
  assert.equal(world.db.prepare("SELECT player_id FROM player_mail LIMIT 1").get().player_id, "p3");
  assert.equal(world.svc.buildMailSnapshot(world.ctx("p2")).messages.length, 1);
  const mailId = world.svc.buildMailSnapshot(world.ctx("p3")).messages[0];
  const claim = world.act("p3", "mail_claim", { mailId: mailId.mailId || mailId.id });
  assert.match(claim.message, /Bleef liggen/);
  assert.equal(world.items("p3", "item.ring"), 1, "nog steeds één ring");
  assert.equal(world.db.prepare("SELECT state FROM player_mail_attachments LIMIT 1").get().state, "available", "de ring ligt nog in de post");
});

test("seintje: wie erbij hoort hoort het meteen (ruil, post, markt)", async () => {
  const world = setup();
  world.svc.getRequestContext = (req) => world.ctx(req.playerId);
  world.svc.ensureRuntime = () => {};
  world.svc.buildSnapshot = () => ({});
  const invited = world.svc.actionForRequest({ playerId: "p1" }, { action: "trade_invite", targetPlayerId: "p2", operationId: "op_ping_1" });
  assert.equal("notify" in invited, false, "het seintje gaat niet mee in het antwoord");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(world.pushes.map((push) => [push.to, push.payload.type]), [["p2", "node05:refresh"]]);
  // Bob neemt aan: Anna krijgt het seintje (en Bob zelf niet).
  world.svc.actionForRequest({ playerId: "p2" }, { action: "trade_accept", tradeId: invited.tradeId, operationId: "op_ping_2" });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(world.pushes.slice(1).map((push) => push.to), ["p1"]);
  // Dezelfde klik nog een keer (zelfde operationId): dezelfde bon, geen tweede seintje.
  world.svc.actionForRequest({ playerId: "p2" }, { action: "trade_accept", tradeId: invited.tradeId, operationId: "op_ping_2" });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(world.pushes.length, 2);
});
