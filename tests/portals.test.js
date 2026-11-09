// Portals (8-11): kaart 🌀 Portal + Instellingen > Portals -> wereld; vrijspelen, reizen (kosten, wachttijd) en respawn.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileGameSection } from "../src/server/authoring/game-compiler.js";
import { arrivalPoint, isUnlocked, nearestRespawnPortal, portalNear, publicPortalState, storeUnlock, travelCost,
  unlockedPortalIds, withinUnlockRange } from "../src/server/runtime/portal-runtime.js";

const portalDoc = (id, body = {}) => ({ docKey: "portal:" + id, kind: "portal", archived: false,
  body: Object.assign({ portalId: id, displayName: id, x: 0, z: 0 }, body) });

test("portal-kaart en Instellingen > Portals zijn geldig en komen in de game-sectie", () => {
  assert.equal(validateDocument("portal", portalDoc("portal.dorp").body).ok, true);
  assert.equal(validateDocument("portal_settings", { travelFrom: "portal", costFlat: 5 }).ok, true);
  const section = compileGameSection([
    portalDoc("portal.dorp", { x: 10, z: 20, startUnlocked: true, rotationY: 90 }),
    portalDoc("portal.bos", { x: 300, z: 20, respawnHere: false }),
    { docKey: "currency:goud", kind: "currency", archived: false, body: { currencyId: "goud", displayName: "Goud" } },
    { docKey: "portal_settings:portal_settings", kind: "portal_settings", archived: false, body: { costCurrencyRef: "currency:goud", costFlat: 2, costPer100m: 1, cooldownSeconds: 30 } }
  ], {});
  assert.deepEqual(section.errors, []);
  const portals = section.server.portals;
  assert.equal(portals.length, 2);
  const dorp = portals.find((portal) => portal.portalId === "portal.dorp");
  assert.equal(dorp.startUnlocked, true);
  assert.equal(dorp.unlockMeters, 4);
  assert.equal(section.server.portalRules.costCurrencyId, "goud");
  assert.equal(section.server.portalRules.cooldownSeconds, 30);
  assert.equal(section.server.portalRules.travelFrom, "anywhere");
});

test("kosten zonder valuta geven een melding", () => {
  const section = compileGameSection([portalDoc("portal.a"),
    { docKey: "portal_settings:portal_settings", kind: "portal_settings", archived: false, body: { costFlat: 5 } }], {});
  assert.ok(section.errors.some((error) => error.code === "PORTAL_COST_CURRENCY"));
});

test("vrijspelen, kosten, aankomst en respawn", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync("db/migrations/027_player_portals.sql", "utf8"));
  const dorp = { id: "dorp", x: 0, z: 0, unlockMeters: 4, startUnlocked: true, respawnHere: true, rotationY: 0, arriveMeters: 2 };
  const bos = { id: "bos", x: 250, z: 0, unlockMeters: 4, startUnlocked: false, respawnHere: true, rotationY: 90, arriveMeters: 2 };
  const portals = [dorp, bos];
  let unlocked = unlockedPortalIds(db, "p1", "w1");
  assert.equal(isUnlocked(dorp, unlocked), true, "meteen vrij");
  assert.equal(isUnlocked(bos, unlocked), false);
  assert.equal(withinUnlockRange({ x: 245, z: 0 }, bos), true, "binnen 4 m + speling");
  assert.equal(withinUnlockRange({ x: 240, z: 0 }, bos), false);
  assert.equal(storeUnlock(db, "p1", "w1", "bos", "2026-11-08T00:00:00Z"), true);
  assert.equal(storeUnlock(db, "p1", "w1", "bos", "2026-11-08T00:00:01Z"), false, "maar één keer");
  unlocked = unlockedPortalIds(db, "p1", "w1");
  assert.equal(isUnlocked(bos, unlocked), true);
  assert.equal(unlockedPortalIds(db, "p2", "w1").size, 0, "per speler");
  const rules = { costCurrencyId: "goud", costFlat: 2, costPer100m: 1, freeAtPortal: true };
  assert.equal(travelCost(rules, { x: 0, z: 100 }, bos, false), 2 + 3, "269 m = 3 x 100 m");
  assert.equal(travelCost(rules, { x: 0, z: 0 }, bos, true), 0, "gratis vanaf een portal");
  assert.equal(travelCost({ costCurrencyId: null, costFlat: 9 }, { x: 0, z: 0 }, bos, false), 0, "zonder valuta gratis");
  const arrive = arrivalPoint(bos);
  assert.ok(Math.abs(arrive.x - 252) < 1e-9 && Math.abs(arrive.z) < 1e-9, "2 m voor de portal (90°)");
  assert.equal(portalNear({ x: 1, z: 1 }, portals, unlocked)?.id, "dorp");
  assert.equal(nearestRespawnPortal(portals, unlocked, { x: 200, z: 0 })?.id, "bos");
  assert.equal(nearestRespawnPortal(portals, new Set(), { x: 200, z: 0 })?.id, "dorp", "alleen vrije portals");
  const state = publicPortalState({ portals, portalRules: rules }, unlocked, "p1", null, { x: 1, z: 1 }, 0);
  assert.equal(state.list.length, 2);
  assert.equal(state.atPortalId, "dorp");
  assert.equal(state.list.find((portal) => portal.id === "bos").cost, 0, "bij een portal gratis");
  const hidden = publicPortalState({ portals: [Object.assign({ flag: { id: "f", on: true } }, bos)] }, unlocked, "p1", { passes: () => false }, null, 0);
  assert.equal(hidden.list.length, 0, "portal met vlag die niet klopt is er niet");
});
