// Werkbank Fase 10 (Kevin 16-11): de punten van een route (NPC loopt een route, vliegroute) zoals de game ze gebruikt.
// Een punt is { x, z } in meter, met h = hoogte boven de grond (zonder h = aan de grond), waitS = wachten, clip = animatie bij het wachten.
export const ROUTE_MAX_POINTS = 64;

export function routePointsOf(list, max = ROUTE_MAX_POINTS) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, max)) {
    const x = Number(raw?.x); const z = Number(raw?.z);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const point = { x, z };
    if (raw.h !== undefined && raw.h !== null && Number.isFinite(Number(raw.h))) point.h = Math.max(0, Math.min(300, Number(raw.h)));
    if (Number(raw.waitS) > 0) point.waitS = Math.min(600, Number(raw.waitS));
    if (typeof raw.clip === "string" && raw.clip) point.clip = raw.clip.slice(0, 120);
    out.push(point);
  }
  return out;
}
