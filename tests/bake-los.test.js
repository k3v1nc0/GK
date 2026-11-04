import test from "node:test";
import assert from "node:assert/strict";
import { worldMapHash } from "../src/server/world-map-hash.js";

// Bake los van SAVE TO GAME: de kaart is alleen verouderd als er iets zichtbaars in de wereld verandert.
test("vingerafdruk van de kaart verandert alleen bij zichtbare wereld", () => {
  const base = () => ({ ground: { id: "g" }, terrain: { heightfield: { chunks: { "0:0": "a" } }, water: [] }, entities: [], scatterAreas: [], lights: [], world: { backgroundColor: "#000" }, gameProject: { catalogs: 1 } });
  const a = worldMapHash(base());
  assert.match(a, /^[0-9a-f]{40}$/);
  assert.equal(worldMapHash(Object.assign(base(), { gameProject: { catalogs: 2 } })), a, "item/kaart-wijziging: kaart blijft goed");
  const hill = base(); hill.terrain.heightfield.chunks["0:0"] = "b";
  assert.notEqual(worldMapHash(hill), a, "heuvel veranderd: kaart verouderd");
  const water = base(); water.terrain.water.push({ id: "w" });
  assert.notEqual(worldMapHash(water), a, "water erbij: kaart verouderd");
  assert.equal(worldMapHash(null), null);
});
