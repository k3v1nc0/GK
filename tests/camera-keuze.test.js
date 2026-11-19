// Camera-keuze (Kevin 19-11): de knop Camerastand en alle camera-instellingen op de kaart Project.
import test from "node:test";
import assert from "node:assert/strict";
import { validateDocument } from "../src/shared/authoring/kinds.js";
import { compileCanonical } from "../src/server/authoring/build-service.js";
import { buildRuntimeWorld } from "../src/server/authoring/world-builder.js";

const doc = (kind, key, body) => ({ docKey: key, kind, body, archived: false, revision: 1 });
const serverData = (docs) => {
  const compiled = compileCanonical(docs, {});
  assert.deepEqual(compiled.errors, []);
  return JSON.parse(compiled.files["server.json"].text);
};

test("zonder instellingen blijft de game top-down zoals altijd", () => {
  const world = buildRuntimeWorld(serverData([doc("project_settings", "project_settings", { gameName: "GK" })]));
  assert.equal(world.camera.mode, "top-down");
  assert.equal(world.camera.pitch, 55);
  assert.equal(world.camera.distance, 24);
  assert.deepEqual([world.camera.minDistance, world.camera.maxDistance], [10, 48]);
  assert.equal(world.camera.playerChoice, false);
  assert.equal(world.chunkLoading.game.gameViewRadiusChunks, 3, "top-down laadt evenveel als vroeger");
});

test("third-person met eigen instellingen gaat naar de game", () => {
  const body = { gameName: "GK", cameraMode: "third_person", cameraPlayerChoice: true, cameraTpDistance: 5, cameraTpShoulder: -0.4,
    cameraTpMouseSpeed: 150, cameraTpFollowDelay: 2, cameraTpObjectDistance: 84, cameraTouchStickSide: "right", cameraTouchStickSize: 140 };
  assert.equal(validateDocument("project_settings", body).ok, true);
  assert.equal(validateDocument("project_settings", { gameName: "GK", cameraMode: "first_person" }).ok, false, "onbekende stand");
  const world = buildRuntimeWorld(serverData([doc("project_settings", "project_settings", body)]));
  assert.equal(world.camera.mode, "third-person");
  assert.equal(world.camera.playerChoice, true);
  assert.equal(world.camera.thirdPerson.distance, 5);
  assert.equal(world.camera.thirdPerson.shoulder, -0.4);
  assert.equal(world.camera.thirdPerson.mouseSpeed, 1.5);
  assert.equal(world.camera.thirdPerson.followDelayMs, 2000);
  assert.deepEqual([world.camera.touch.side, world.camera.touch.size], ["right", 140]);
  assert.equal(world.chunkLoading.game.gameViewRadiusChunks, 6, "objecten laden rondom tot 84 m (vakken van 14 m)");
  assert.equal(world.chunkLoading.game.cameraOffsetZChunks, 0);
});

test("oude camera-afstand en -hoek van de kaart Wereld gaan mee tot Project ze heeft", () => {
  // Oude Wereld-kaart (opgeslagen voor 19-11): de velden staan niet meer in het schema, de build neemt ze over.
  const oldWorld = doc("world_settings", "world_settings", { groundSize: 300, cameraDistance: 30, cameraPitch: 62 });
  const legacy = buildRuntimeWorld(serverData([oldWorld, doc("project_settings", "project_settings", { gameName: "GK" })]));
  assert.deepEqual([legacy.camera.distance, legacy.camera.pitch, legacy.camera.maxDistance], [30, 62, 60]);
  const moved = buildRuntimeWorld(serverData([oldWorld, doc("project_settings", "project_settings", { gameName: "GK", cameraDistance: 20 })]));
  assert.deepEqual([moved.camera.distance, moved.camera.pitch], [20, 62], "Project gaat voor, de rest komt nog van Wereld");
});
