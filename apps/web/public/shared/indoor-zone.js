// Kevin 23-11: 🏠 Binnen-zone. Alle binnenruimtes (huizen, grotten, etages) staan hier naast elkaar, ver achter de
// kaart: de wereld is hooguit 4 km breed rond 0,0 (rand op 2 km), de zone ligt op 50 km. In de editor is dit de tab
// 🏠 Binnen (zwart canvas). Voor de server en de game is het gewoon dezelfde wereld; je komt er via een 🚪 Doorgang.
export const INDOOR_ZONE = Object.freeze({ centerX: 50000, centerZ: 0, minX: 48000, maxX: 52000, minZ: -2000, maxZ: 2000 });
// Zo dicht mag de wereld (de grond) hooguit bij de zone komen; anders weigert de build.
export const INDOOR_ZONE_KEEP_OUT_M = 10000;

export function inIndoorZone(x, z, margin = 0) {
  const px = Number(x);
  const pz = Number(z);
  return Number.isFinite(px) && Number.isFinite(pz)
    && px >= INDOOR_ZONE.minX - margin && px <= INDOOR_ZONE.maxX + margin
    && pz >= INDOOR_ZONE.minZ - margin && pz <= INDOOR_ZONE.maxZ + margin;
}

// Komt een rechthoek (de grond van de wereld) te dicht bij de zone?
export function groundTooCloseToIndoorZone(bounds) {
  if (!bounds) return false;
  const keep = INDOOR_ZONE_KEEP_OUT_M;
  return Number(bounds.maxX) > INDOOR_ZONE.minX - keep && Number(bounds.minX) < INDOOR_ZONE.maxX + keep
    && Number(bounds.maxZ) > INDOOR_ZONE.minZ - keep && Number(bounds.minZ) < INDOOR_ZONE.maxZ + keep;
}
