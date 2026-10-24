import assert from "node:assert/strict";
import test from "node:test";
import { portalArrivalPointFor } from "../src/server/mmo-service.js";

// Kevin-handtest 2026-10-24: na een portalreis stond je ín de (solid) doelportal en binnen het bereik van de
// terugportal; een klik naast je karakter stuurde je direct terug. Aankomst hoort ernaast, buiten dat bereik.
function target(overrides = {}) {
  return {
    model: Object.assign({ x: 8, y: 0, z: 500, collisionRadius: 1, facing: 0 }, overrides.model || {}),
    portal: Object.assign({ range: 2 }, overrides.portal || {}),
    zonePackage: overrides.zonePackage || { spawns: [{ spawnId: "spawn.default", role: "zone_default", x: 0, z: 500 }] }
  };
}

const worldContext = { world: { player: { collisionRadius: 0.5 } }, solidColliders: [] };

test("aankomst ligt naast de portal, buiten botsobject en terugbereik", function () {
  const arrival = portalArrivalPointFor(worldContext, target());
  const distance = Math.hypot(arrival.x - 8, arrival.z - 500);
  assert.ok(distance > 1 + 0.5, "niet in het botsobject (afstand " + distance + ")");
  assert.ok(distance > 2 + 1, "buiten bereik + straal van de terugportal (afstand " + distance + ")");
});

test("aankomst ligt aan de kant van het startpunt van de zone", function () {
  const arrival = portalArrivalPointFor(worldContext, target());
  assert.ok(arrival.x < 8, "richting het startpunt (x " + arrival.x + ")");
  assert.ok(Math.abs(arrival.z - 500) < 0.01, "op de lijn naar het startpunt (z " + arrival.z + ")");
});

test("aankomst ontwijkt een ander obstakel", function () {
  const blocked = portalArrivalPointFor(worldContext, target());
  const context = Object.assign({}, worldContext, { solidColliders: [{ x: blocked.x, z: blocked.z, radius: 1.5, enabled: true }] });
  const arrival = portalArrivalPointFor(context, target());
  assert.ok(Math.hypot(arrival.x - blocked.x, arrival.z - blocked.z) >= 1.5 + 0.5, "niet in het andere obstakel");
});

test("portal zonder botsstraal: aankomst op de portal zelf", function () {
  const arrival = portalArrivalPointFor(worldContext, target({ model: { collisionRadius: 0 } }));
  assert.equal(arrival.x, 8);
  assert.equal(arrival.z, 500);
});
