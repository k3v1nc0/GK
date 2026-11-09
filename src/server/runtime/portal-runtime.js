// Portals (8-11): vrijspelen, reizen en terugkomen na doodgaan, allemaal binnen dezelfde wereld.
// De server beslist alles: of je dichtbij genoeg bent, of de portal vrij is, of je mag reizen (gevecht, wachttijd,
// geld) en waar je aankomt. De game vraagt alleen ("speel vrij", "reis naar"). Klein en zuinig: een paar portals,
// één tabel (player_portals) en een wachttijd in het geheugen.

export const DEFAULT_PORTAL_RULES = Object.freeze({
  travelFrom: "anywhere", costCurrencyId: null, costFlat: 0, costPer100m: 0, freeAtPortal: true,
  cooldownSeconds: 0, combatBlockSeconds: 8, respawnAtPortal: true
});
// Wat de server extra toestaat bovenop de vrijspeel-afstand (de game ziet je net iets eerder dan de server).
export const PORTAL_RANGE_SLACK_M = 1.5;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function portalRulesOf(world) {
  return Object.assign({}, DEFAULT_PORTAL_RULES, world?.portalRules || {});
}

export function portalsOf(world) {
  return Array.isArray(world?.portals) ? world.portals.filter((portal) => portal && portal.id) : [];
}

// Een portal met "Alleen als vlag" bestaat alleen voor wie die vlag (niet) heeft.
export function portalVisibleFor(portal, playerId, flags) {
  return !portal?.flag || !flags || flags.passes(playerId, portal.flag);
}

export function distanceTo(position, portal) {
  if (!position || !portal) return Infinity;
  return Math.hypot(num(position.x) - num(portal.x), num(position.z) - num(portal.z));
}

export function withinUnlockRange(position, portal) {
  return distanceTo(position, portal) <= Math.max(1, num(portal?.unlockMeters, 4)) + PORTAL_RANGE_SLACK_M;
}

export function unlockedPortalIds(db, playerId, worldId) {
  const rows = db.prepare("SELECT portal_id FROM player_portals WHERE player_id = ? AND world_id = ?").all(playerId, worldId);
  return new Set(rows.map((row) => row.portal_id));
}

export function isUnlocked(portal, unlocked) {
  return portal?.startUnlocked === true || unlocked.has(portal?.id);
}

export function storeUnlock(db, playerId, worldId, portalId, stamp) {
  const result = db.prepare("INSERT OR IGNORE INTO player_portals (player_id, world_id, portal_id, unlocked_at) VALUES (?, ?, ?, ?)")
    .run(playerId, worldId, portalId, stamp);
  return result.changes > 0;
}

// Sta je bij een (vrije) portal? Dan mag je bij "Alleen bij een portal" reizen en is de reis met "Gratis vanaf een portal" gratis.
export function portalNear(position, portals, unlocked) {
  return portals.find((portal) => isUnlocked(portal, unlocked) && withinUnlockRange(position, portal)) || null;
}

// Kosten: vast + per 100 m (afgerond naar boven). Gratis zonder valuta of als je bij een portal staat en dat gratis is.
export function travelCost(rules, position, target, atPortal) {
  if (!rules.costCurrencyId) return 0;
  if (atPortal && rules.freeAtPortal !== false) return 0;
  const meters = distanceTo(position, target);
  const per100 = Math.max(0, Math.round(num(rules.costPer100m)));
  return Math.max(0, Math.round(num(rules.costFlat))) + (per100 > 0 && Number.isFinite(meters) ? Math.ceil(meters / 100) * per100 : 0);
}

// Aankomen: een paar meter voor de portal (de kant waar hij naartoe kijkt), met je gezicht van de portal af.
export function arrivalPoint(portal) {
  const deg = num(portal?.rotationY);
  const rad = deg * Math.PI / 180;
  const meters = Math.max(0, num(portal?.arriveMeters, 2.5));
  return { x: num(portal?.x) + Math.sin(rad) * meters, y: num(portal?.y), z: num(portal?.z) + Math.cos(rad) * meters, rotationY: deg };
}

// Na doodgaan: de dichtstbijzijnde vrije portal met "Respawn hier" (null = de gewone startplek).
export function nearestRespawnPortal(portals, unlocked, position, visible = () => true) {
  let best = null;
  let bestDistance = Infinity;
  for (const portal of portals) {
    if (portal.respawnHere === false || !isUnlocked(portal, unlocked) || !visible(portal)) continue;
    const distance = distanceTo(position, portal);
    if (distance < bestDistance || (distance === bestDistance && best && portal.id < best.id)) { best = portal; bestDistance = distance; }
  }
  return best;
}

// Wat de game van de portals weet (alleen wat deze speler mag zien).
export function publicPortalState(world, unlocked, playerId, flags, position, cooldownLeftMs) {
  const rules = portalRulesOf(world);
  const portals = portalsOf(world).filter((portal) => portalVisibleFor(portal, playerId, flags));
  const atPortal = portalNear(position, portals, unlocked);
  return {
    list: portals.map((portal) => ({
      id: portal.id, displayName: portal.displayName || portal.id, x: num(portal.x), y: num(portal.y), z: num(portal.z),
      unlockMeters: Math.max(1, num(portal.unlockMeters, 4)), unlocked: isUnlocked(portal, unlocked),
      respawnHere: portal.respawnHere !== false,
      cost: travelCost(rules, position, portal, Boolean(atPortal))
    })),
    rules: { travelFrom: rules.travelFrom, costCurrencyId: rules.costCurrencyId, freeAtPortal: rules.freeAtPortal !== false,
      cooldownSeconds: rules.cooldownSeconds, combatBlockSeconds: rules.combatBlockSeconds },
    atPortalId: atPortal ? atPortal.id : null,
    cooldownLeftMs: Math.max(0, Math.round(num(cooldownLeftMs)))
  };
}
