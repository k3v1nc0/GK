// Kevin 20-11: lucht met zon en wolken. Kaart Wereld -> build -> world.sky (de game tekent die met shared/sky-render.js).
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
const worldOf = (settings) => {
  const compiled = compileCanonical([doc("world_settings", "world_settings", settings)], {});
  assert.deepEqual(compiled.errors, []);
  return buildRuntimeWorld(JSON.parse(compiled.files["server.json"].text));
};

test("lucht staat standaard aan; instellingen uit de kaart gaan mee naar de game", () => {
  const settings = { skyColor: "#336699", skyHorizonColor: "#ddeeff", nightHorizonColor: "#112233", sunColor: "#ffeeaa", sunSize: 6,
    sunGlow: 40, cloudCoverage: 70, cloudColor: "#eeeeee", cloudSoftness: 20, cloudSize: 150, cloudRim: 80, windSpeed: 2.5, windAngle: 90 };
  assert.equal(validateDocument("world_settings", settings).ok, true);
  const world = worldOf(settings);
  assert.deepEqual(world.sky, { enabled: true, topColor: "#336699", horizonColor: "#ddeeff", nightTopColor: "#0e1a33", nightHorizonColor: "#112233",
    sunColor: "#ffeeaa", sunSize: 6, sunGlow: 0.4, cloudColor: "#eeeeee", cloudCoverage: 0.7, cloudSoftness: 0.2, cloudSize: 1.5, cloudRim: 0.8,
    windSpeed: 2.5, windAngle: 90 });
  assert.equal(world.world.backgroundColor, "#ddeeff", "achtergrond en mist = horizon");
  assert.deepEqual([world.dayNight.daySkyColor, world.dayNight.nightSkyColor], ["#ddeeff", "#112233"]);
  assert.equal(worldOf({}).sky.enabled, true, "zonder kaart ook een lucht");
  assert.equal(world.camera.thirdPerson.fog, true, "mist in de verte staat standaard aan (kaart Project)");
});

test("lucht uit: alleen de egale Kleur van de lucht, zoals vroeger", () => {
  const world = worldOf({ skyOn: false, skyColor: "#102030", nightSkyColor: "#000011" });
  assert.deepEqual(world.sky, { enabled: false });
  assert.equal(world.world.backgroundColor, "#102030");
  assert.deepEqual([world.dayNight.daySkyColor, world.dayNight.nightSkyColor], ["#102030", "#000011"]);
});
