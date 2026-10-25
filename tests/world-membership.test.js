// Fase 04 (F4-E2-T01): de server bepaalt Region/Area uit de actieve build en zet die op de in-memory state.
import assert from "node:assert/strict";
import test from "node:test";
import { MmoService } from "../src/server/mmo-service.js";

function fakeService(build) {
  const service = Object.create(MmoService.prototype);
  service.canonicalBuildProvider = () => build;
  service.spatialCache = null;
  return service;
}

const world = {
  regions: [
    { regionId: "region.west", displayName: "West", minXMm: -50000, maxXMm: 0, minZMm: -50000, maxZMm: 50000, musicAssetId: "music_west" },
    { regionId: "region.oost", displayName: "Oost", minXMm: 0, maxXMm: 50000, minZMm: -50000, maxZMm: 50000 }
  ],
  areas: [{ areaId: "area.plein", displayName: "Plein", regionId: "region.oost", shape: "box", minXMm: 10000, maxXMm: 30000, minZMm: -10000, maxZMm: 10000, musicAssetId: "music_plein" }],
  cells: { "-1_0": { regions: ["region.west"], areas: [] }, "0_0": { regions: ["region.oost"], areas: ["area.plein"] } },
  audio: { music_west: "/assets/uploads/west.mp3", music_plein: "/assets/uploads/plein.mp3" }
};

test("membership: server rekent world-meters om naar mm, hysteresis per build, payload met muziek", function () {
  const service = fakeService({ buildId: "b_000000000000000000000001", data: { world } });
  const state = service.assignSpatialMembership({ player_id: "p1", x: -5, z: 3 });
  assert.equal(state.current_region_id, "region.west");
  assert.equal(state.current_area_id, null);
  let payload = service.spatialMembershipPayload(state);
  assert.equal(payload.regionName, "West");
  assert.equal(payload.musicUrl, "/assets/uploads/west.mp3");
  // Net over de grens (0,3 m): blijft West door hysteresis.
  const next = service.assignSpatialMembership({ player_id: "p1", x: 0.3, z: 3 }, state);
  assert.equal(next.current_region_id, "region.west");
  const plein = service.assignSpatialMembership({ player_id: "p1", x: 15, z: 0 }, next);
  assert.equal(plein.current_region_id, "region.oost");
  assert.equal(plein.current_area_id, "area.plein");
  payload = service.spatialMembershipPayload(plein);
  assert.equal(payload.areaName, "Plein");
  assert.equal(payload.musicUrl, "/assets/uploads/plein.mp3", "Area-muziek gaat voor Region-muziek");
});

test("membership: zonder canonieke build of zonder wereld geen Region, geen crash", function () {
  const none = fakeService(null).assignSpatialMembership({ x: 1, z: 1 });
  assert.equal(none.current_region_id, null);
  const empty = fakeService({ buildId: "b_000000000000000000000002", data: {} }).assignSpatialMembership({ x: 1, z: 1 });
  assert.equal(empty.current_area_id, null);
  const service = fakeService({ buildId: "b_000000000000000000000003", data: { world } });
  const bad = service.assignSpatialMembership({ x: "x", z: 1 });
  assert.equal(bad.current_region_id, undefined, "ongeldige positie: niets aangepast");
});
