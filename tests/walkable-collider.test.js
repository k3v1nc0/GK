// Fase 04 (F4-E1-T03): obstakels (colliders). Eén bron: de build. Server-movement en game-prediction lezen dezelfde blockers.
import assert from "node:assert/strict";
import test from "node:test";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { CommandService } from "../src/server/authoring/command-service.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { applyCanonicalBuild } from "../src/server/authoring/runtime-overlay.js";
import { createWalkabilityIndex, isPointBlockedByBlocker } from "../apps/web/public/shared/movement-kernel.js";
import { areaContains, metersToMm } from "../apps/web/public/shared/spatial.js";
import { authoringDb } from "./authoring-helpers.js";

const region = { regionId: "region.dorp", displayName: "Dorp", minXMm: -40000, maxXMm: 40000, minZMm: -40000, maxZMm: 40000 };
const huis = { colliderId: "collider.huis", displayName: "Huis", regionRef: "region:region.dorp", shape: "box", minXMm: -10000, maxXMm: -2000, minZMm: 5000, maxZMm: 12000 };
const boom = { colliderId: "collider.boom", displayName: "Boom", regionRef: "region:region.dorp", shape: "cylinder", centerXMm: 15000, centerZMm: -5000, radiusMm: 1500 };
const rots = { colliderId: "collider.rots", displayName: "Rots", regionRef: "region:region.dorp", shape: "polygon", pointsMm: [[0, -20000], [8000, -18000], [5000, -12000], [-1000, -14000]] };
const doc = (kind, body) => ({ docKey: kind + ":" + (body.regionId || body.colliderId), kind, revision: 1, body, archived: false, legacyRef: null });

test("collider: vormregels en binnen de Region", function () {
  assert.equal(validateDocument("collider", huis).ok, true);
  assert.equal(validateDocument("collider", boom).ok, true);
  assert.equal(validateDocument("collider", rots).ok, true);
  const leeg = Object.assign({}, huis); delete leeg.maxXMm;
  assert.equal(validateDocument("collider", leeg).issues[0].code, "FIELD_REQUIRED", "obstakel zonder vorm bestaat niet");
  assert.equal(validateDocument("collider", Object.assign({}, huis, { maxXMm: -10000 })).issues[0].code, "AREA_EMPTY");
  const db = authoringDb();
  const service = new CommandService(db);
  service.execute({ requestId: "req-coll-0001", command: "create", kind: "region", body: region }, "kevin");
  service.execute({ requestId: "req-coll-0002", command: "create", kind: "collider", body: huis }, "kevin");
  assert.throws(() => service.execute({ requestId: "req-coll-0003", command: "create", kind: "collider", body: Object.assign({}, boom, { centerXMm: 39500 }) }, "kevin"), { code: "AREA_OUTSIDE_REGION" });
});

test("collider: build -> blockers; speler-blokkade en collider-vorm gelijk op 1000 punten", function () {
  const compiled = compileCanonical([doc("region", region), doc("collider", huis), doc("collider", boom), doc("collider", rots)]);
  assert.deepEqual(compiled.errors, []);
  const server = JSON.parse(compiled.files["server.json"].text);
  const client = JSON.parse(compiled.files["client.json"].text);
  assert.equal(server.world.colliders.length, 3);
  assert.deepEqual(client.world.colliders, server.world.colliders, "client en server krijgen dezelfde geometrie");
  assert.ok(server.world.cells["-1_0"].colliders.includes("collider.huis"));
  // Navtile-input (F5) kan deze mm-geometrie zonder conversie lezen: dezelfde velden als het document.
  assert.deepEqual(server.world.colliders.find((c) => c.colliderId === "collider.rots").pointsMm, rots.pointsMm);

  const legacyWorld = { gameProject: { zones: { packages: [], byId: {} }, catalogs: {} }, collision: { blockers: [{ id: "oud", shapeType: "circle", x: 30, z: 30, radius: 1 }] } };
  const applied = applyCanonicalBuild(legacyWorld, { buildId: compiled.buildId, data: server });
  assert.equal(legacyWorld.collision.blockers.length, 1, "gepubliceerde wereld zelf blijft ongewijzigd");
  assert.equal(applied.collision.blockers.length, 4, "oude blocker blijft, drie nieuwe erbij");
  const index = createWalkabilityIndex(applied);
  let blocked = 0;
  for (let i = 0; i < 1000; i += 1) {
    const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 38;
    const z = ((Math.cos(i * 78.233) * 12345.6789) % 1) * 38;
    const kernel = isPointBlockedByBlocker(index, x, z, 0) && !(Math.hypot(x - 30, z - 30) <= 1);
    const authored = server.world.colliders.some((collider) => areaContains(collider, metersToMm(x), metersToMm(z)));
    assert.equal(kernel, authored, "punt " + x + "," + z);
    if (kernel) blocked += 1;
  }
  assert.ok(blocked > 10, "de steekproef raakt echt obstakels (" + blocked + ")");
  // Midden in het huis en in de boom: geblokkeerd. Ernaast: vrij.
  assert.equal(isPointBlockedByBlocker(index, -6, 8, 0), true);
  assert.equal(isPointBlockedByBlocker(index, 15, -5, 0), true);
  assert.equal(isPointBlockedByBlocker(index, 0, 0, 0), false);
});
