// Werkbank Fase 10 (Kevin 15-11): NPC's die rondlopen. De actor-runtime zet hier per wereld waar ze nu staan;
// winkel, werkplek, markt en quest-gesprek rekenen hun afstand vanaf die plek (niet vanaf de plek in de editor).
const byWorld = new Map();

// map: entity-ID ("npc_entity.<npcId>") -> object met x en z (de lopende NPC zelf, dus altijd de laatste plek).
export function setNpcLivePositions(worldId, map) {
  const key = String(worldId || "");
  if (map && map.size) byWorld.set(key, map);
  else byWorld.delete(key);
}

export function npcLivePosition(worldId, entityId) {
  const entry = byWorld.get(String(worldId || ""))?.get(String(entityId || ""));
  return entry && Number.isFinite(entry.x) && Number.isFinite(entry.z) ? { x: entry.x, z: entry.z } : null;
}

// Een doel (winkel, quest-gesprek) met de plek van de lopende NPC erin, of het doel zoals het was.
export function withNpcLivePosition(worldId, target, entityId) {
  const live = target ? npcLivePosition(worldId, entityId) : null;
  return live ? Object.assign({}, target, { x: live.x, z: live.z }) : target;
}
