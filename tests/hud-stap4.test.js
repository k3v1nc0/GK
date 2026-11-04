// Stap 4 (HUD): de nieuwe knoppen in de tas (Gebruiken, Uitdoen, Weggooien) en de catalogus die de HUD leest.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Node03RuntimeService } from "../src/server/node03-runtime-service.js";
import { runtimeItemFromCanonical } from "../src/server/authoring/runtime-overlay.js";

test("Geneest gaat mee naar de runtime; 0 = geen knop Gebruiken", () => {
  assert.equal(runtimeItemFromCanonical({ itemId: "item.brood", displayName: "Brood", healAmount: 20 }).healAmount, 20);
  assert.equal("healAmount" in runtimeItemFromCanonical({ itemId: "item.steen", displayName: "Steen", healAmount: 0 }), false);
});

function setup() {
  const db = new DatabaseSync(":memory:");
  for (const file of fs.readdirSync("db/migrations").filter((name) => name.endsWith(".sql")).sort()) db.exec(fs.readFileSync("db/migrations/" + file, "utf8"));
  db.exec("PRAGMA foreign_keys = ON");
  const stamp = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, password_salt, role, created_at, updated_at) VALUES ('u1', 'anna', 'x', 'x', 'player', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, created_at, updated_at) VALUES ('p1', 'u1', 'anna', NULL, 'world.main', ?, ?)").run(stamp, stamp);
  db.prepare("INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, updated_at) VALUES ('p1', 'stat.health', 100, 0, 70, ?)").run(stamp);
  const stack = db.prepare("INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, created_at, updated_at) VALUES (?, 'p1', ?, 'none', ?, ?, ?)");
  stack.run("s1", "item.brood", 3, stamp, stamp);
  stack.run("s2", "item.briefje", 1, stamp, stamp);
  stack.run("s3", "item.steen", 5, stamp, stamp);
  const instance = db.prepare("INSERT INTO player_item_instances (id, player_id, item_id, bind_state, location_type, location_ref, created_at, updated_at) VALUES (?, 'p1', ?, 'none', ?, ?, ?, ?)");
  instance.run("i.helm", "item.helm", "inventory", null, stamp, stamp);
  instance.run("i.zwaard", "item.zwaard", "equipment", "equipment_slot.main_hand", stamp, stamp);
  db.prepare("INSERT INTO player_equipment (player_id, slot_id, item_instance_id, equipped_at) VALUES ('p1', 'equipment_slot.main_hand', 'i.zwaard', ?)").run(stamp);
  const svc = Object.create(Node03RuntimeService.prototype);
  svc.db = db;
  const ctx = {
    profile: { id: "p1" },
    worldId: "world.main",
    zoneId: "zone.start",
    catalogs: {
      items: {
        "item.brood": { id: "item.brood", displayName: "Brood", category: "consumable", healAmount: 20, iconAssetId: "asset.brood" },
        "item.briefje": { id: "item.briefje", displayName: "Briefje", category: "quest", questItem: true },
        "item.steen": { id: "item.steen", displayName: "Steen", category: "material", vendorBaseValueMinor: 2 },
        "item.helm": { id: "item.helm", displayName: "Helm", category: "equipment", stackable: false, equipmentSlotRef: "equipment_slot.head", armorBonus: 3, worldModelAssetId: "asset.helm" },
        "item.zwaard": { id: "item.zwaard", displayName: "Zwaard", category: "equipment", stackable: false, equipmentSlotRef: "equipment_slot.main_hand", attackPowerBonus: 5 }
      },
      equipmentSlots: {
        "equipment_slot.main_hand": { id: "equipment_slot.main_hand", displayName: "Hand", uiOrder: 2 },
        "equipment_slot.head": { id: "equipment_slot.head", displayName: "Hoofd", uiOrder: 1 }
      },
      currencies: { "currency.goud": { id: "currency.goud", displayName: "Goud", iconAssetId: "asset.munt" } }
    }
  };
  const qty = (itemId) => db.prepare("SELECT quantity FROM player_inventory_stacks WHERE player_id = 'p1' AND item_id = ?").get(itemId).quantity;
  const health = () => db.prepare("SELECT current_value FROM player_stats WHERE player_id = 'p1' AND stat_id = 'stat.health'").get().current_value;
  const where = (id) => db.prepare("SELECT location_type FROM player_item_instances WHERE id = ?").get(id).location_type;
  return { db, svc, ctx, qty, health, where };
}

test("Gebruiken: brood geneest tot het maximum en kost er één", () => {
  const { svc, ctx, qty, health } = setup();
  const result = svc.useItem(ctx, { itemId: "item.brood" }, "op1");
  assert.equal(result.message, "Brood: +20 levens.");
  assert.equal(health(), 90);
  assert.equal(qty("item.brood"), 2);
  svc.useItem(ctx, { itemId: "item.brood" }, "op2");
  assert.equal(health(), 100, "niet boven het maximum");
  assert.throws(() => svc.useItem(ctx, { itemId: "item.brood" }, "op3"), (error) => error.status === 409 && /al vol/.test(error.message));
  assert.equal(qty("item.brood"), 1, "met volle levens gaat er niets af");
  assert.throws(() => svc.useItem(ctx, { itemId: "item.steen" }, "op4"), (error) => error.status === 409 && /kun je niet gebruiken/.test(error.message));
});

test("Uitdoen: het zwaard gaat terug in de tas", () => {
  const { db, svc, ctx, where } = setup();
  const result = svc.unequipItem(ctx, { slotId: "equipment_slot.main_hand" });
  assert.equal(result.message, "Zwaard uitgedaan.");
  assert.equal(where("i.zwaard"), "inventory");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM player_equipment WHERE player_id = 'p1'").get().n, 0);
  assert.throws(() => svc.unequipItem(ctx, { slotId: "equipment_slot.main_hand" }), (error) => error.status === 404);
});

test("Weggooien: los stuk weg, stapel min één, questitem en gedragen spullen blijven", () => {
  const { svc, ctx, qty, where } = setup();
  assert.throws(() => svc.destroyItem(ctx, { itemId: "item.briefje" }, "op1"), (error) => error.status === 409 && /questitem/.test(error.message));
  assert.equal(qty("item.briefje"), 1);
  assert.throws(() => svc.destroyItem(ctx, { itemInstanceId: "i.zwaard" }, "op2"), (error) => error.status === 404);
  assert.equal(where("i.zwaard"), "equipment");
  svc.destroyItem(ctx, { itemInstanceId: "i.helm" }, "op3");
  assert.equal(where("i.helm"), "deleted");
  svc.destroyItem(ctx, { itemId: "item.steen" }, "op4");
  assert.equal(qty("item.steen"), 4);
});

test("Catalogus voor de HUD: plaatjes, slot, bonussen, questitem en de vakjes", () => {
  const { svc, ctx } = setup();
  const catalog = svc.loadHudCatalog(ctx);
  const byId = Object.fromEntries(catalog.items.map((item) => [item.itemId, item]));
  assert.equal(byId["item.brood"].healAmount, 20);
  assert.equal(byId["item.brood"].iconAssetId, "asset.brood");
  assert.equal(byId["item.helm"].modelAssetId, "asset.helm");
  assert.equal(byId["item.helm"].equipSlot, "equipment_slot.head");
  assert.equal(byId["item.helm"].armorBonus, 3);
  assert.equal(byId["item.zwaard"].attackPowerBonus, 5);
  assert.equal(byId["item.briefje"].questItem, true);
  assert.equal(byId["item.steen"].vendorValue, 2);
  assert.equal(catalog.currencies[0].iconAssetId, "asset.munt");
  assert.deepEqual(catalog.equipmentSlots.map((slot) => slot.slotId), ["equipment_slot.head", "equipment_slot.main_hand"]);
});

test("Kaarttegels: bewaard op vingerafdruk, actief na commit, oude tegels en foto opgeruimd; foute invoer geweigerd", async () => {
  const os = await import("node:os");
  const path = await import("node:path");
  const { AssetService } = await import("../src/server/asset-service.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-minimap-"));
  try {
    const service = new AssetService(null, dir, { assetsDir: dir, skipModelThumbnails: true });
    assert.equal(service.minimapTiles(), null);
    fs.mkdirSync(path.join(dir, "minimap-bakes"));
    fs.writeFileSync(path.join(dir, "minimap-bakes", "world-1.webp"), "oud");
    fs.writeFileSync(path.join(dir, "minimap-bakes", "world-minimap.json"), "{}");
    const png = (n) => Buffer.concat([Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"), Buffer.from([n])]);
    const first = service.saveMinimapTiles({ "0:-1:0": { data: png(1) }, "0:0:0": { data: png(2) }, "1:0:0": { data: png(1) } });
    assert.equal(first["0:-1:0"], first["1:0:0"], "zelfde inhoud = zelfde bestand");
    assert.match(first["0:0:0"], /^[0-9a-f]{40}\.png$/);
    const bounds = { minX: -32, maxX: 32, minZ: 0, maxZ: 32 };
    const result = service.commitMinimapTiles({ tilePx: 512, baseMeters: 32, levels: 2, bounds, tiles: first, buildId: "b1" });
    assert.equal(result.tiles, 3);
    assert.equal(result.unique, 2);
    assert.equal(fs.existsSync(path.join(dir, "minimap-bakes", "world-1.webp")), false, "oude foto weg");
    const manifest = service.minimapTiles();
    assert.equal(manifest.baseUrl, "/assets/minimap-tiles/");
    assert.deepEqual(manifest.bounds, bounds);
    assert.equal(manifest.tiles["0:0:0"], first["0:0:0"]);
    // Nieuwe bake: tegel 0:0:0 is veranderd; de oude versie wordt opgeruimd.
    const second = service.saveMinimapTiles({ "0:0:0": { data: png(3) } });
    service.commitMinimapTiles({ tilePx: 512, baseMeters: 32, levels: 2, bounds, tiles: Object.assign({}, first, second) });
    assert.equal(fs.existsSync(path.join(dir, "minimap-tiles", first["0:0:0"])), false);
    assert.equal(fs.existsSync(path.join(dir, "minimap-tiles", second["0:0:0"])), true);
    const bad = (fn) => assert.throws(fn, (error) => error.status === 400);
    bad(() => service.saveMinimapTiles({ "0:0:0": { data: Buffer.from("nope") } }));
    bad(() => service.saveMinimapTiles({ "../x": { data: png(1) } }));
    bad(() => service.commitMinimapTiles({ tilePx: 512, baseMeters: 32, levels: 1, bounds, tiles: { "1:0:0": first["1:0:0"] } }));
    bad(() => service.commitMinimapTiles({ tilePx: 512, baseMeters: 32, levels: 2, bounds, tiles: { "0:0:0": "0".repeat(40) + ".png" } }));
    bad(() => service.commitMinimapTiles({ tilePx: 512, baseMeters: 32, levels: 2, bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 1 }, tiles: first }));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Mist op de kaart: standaard aan met vakjes van 8 m; uit te zetten, zicht, donkerte en zachte rand instelbaar", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const docs = (hud) => [{ docKey: "project_settings", kind: "project_settings", body: { gameName: "GK", xpPerLevel: 300, maxLevel: 30 }, archived: false, revision: 1 }]
    .concat(hud ? [{ docKey: "hud_settings", kind: "hud_settings", body: hud, archived: false, revision: 1 }] : []);
  const world = (hud) => {
    const compiled = compileCanonical(docs(hud), {});
    assert.deepEqual(compiled.errors, []);
    return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
  };
  const fog = world(null).minimap.game.fogOfWar;
  assert.equal(fog.enabled, true);
  assert.equal(fog.cellSize, 8);
  assert.equal(fog.revealRadius, 5);
  assert.equal(fog.fogOpacity, 1, "standaard helemaal dicht");
  assert.equal(fog.fogFeatherRadius, 1, "standaard 8 m zachte rand = 1 vakje");
  const custom = world({ fogOfWar: false, fogRevealMeters: 80, fogDarkness: 80, fogFadeMeters: 16 }).minimap.game.fogOfWar;
  assert.equal(custom.enabled, false);
  assert.equal(custom.revealRadius, 10);
  assert.equal(custom.fogOpacity, 0.8);
  assert.equal(custom.fogFeatherRadius, 2);
  const hard = world({ fogDarkness: 0, fogFadeMeters: 0 }).minimap.game.fogOfWar;
  assert.equal(hard.fogOpacity, 0, "0 blijft 0");
  assert.equal(hard.fogFeatherRadius, 0);
});

test("Ronde 10: deelgebied-namen op de kaart en grootte van items op de grond", async () => {
  const { compileCanonical } = await import("../src/server/authoring/build-service.js");
  const { buildRuntimeWorld } = await import("../src/server/authoring/world-builder.js");
  const doc = (kind, body) => ({ docKey: kind + ":" + (body.regionId || body.areaId || kind), kind, body, archived: false, revision: 1 });
  const compiled = compileCanonical([
    doc("project_settings", { gameName: "GK", xpPerLevel: 300, maxLevel: 30 }),
    doc("region", { regionId: "region.r", displayName: "Oud gebied", minXMm: 0, maxXMm: 100000, minZMm: 0, maxZMm: 100000 }),
    doc("area", { areaId: "area.dorp", displayName: "Dorp", regionRef: "region:region.r", shape: "box", minXMm: 10000, maxXMm: 30000, minZMm: 20000, maxZMm: 40000 })
  ], {});
  assert.deepEqual(compiled.errors, []);
  const labels = buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text)).minimap.game.areaLabels;
  assert.deepEqual(labels, [{ id: "area.dorp", name: "Dorp", x: 20, z: 30 }], "alleen het deelgebied, midden in het vlak");
  assert.equal(runtimeItemFromCanonical({ itemId: "item.vlees", displayName: "Vlees" }).worldModelScale, 1, "standaard 100 %");
  assert.equal(runtimeItemFromCanonical({ itemId: "item.vlees", displayName: "Vlees", modelScaleBp: 25000 }).worldModelScale, 2.5);
});
