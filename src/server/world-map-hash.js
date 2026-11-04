import crypto from "node:crypto";

// Bake los van SAVE TO GAME: een vingerafdruk van alles wat op de kaart (minimap) te zien is: grond, terrein
// (hoogte, verf, water), modellen, begroeiing, licht en lucht. Verandert er iets anders (bijv. een item),
// dan blijft de kaart "up-to-date". Per wereld onthouden: de wereld verandert alleen bij een nieuwe build.
const cache = new WeakMap();

export function worldMapHash(world) {
  if (!world || typeof world !== "object") return null;
  if (cache.has(world)) return cache.get(world);
  const visible = {
    ground: world.ground || null,
    terrain: world.terrain || null,
    entities: world.entities || [],
    scatterAreas: world.scatterAreas || [],
    lights: world.lights || [],
    sky: world.world?.backgroundColor || null
  };
  const hash = crypto.createHash("sha1").update(JSON.stringify(visible)).digest("hex");
  cache.set(world, hash);
  return hash;
}
