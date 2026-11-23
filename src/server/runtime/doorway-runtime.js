// Doorgangen (22-11): een deur, grot-ingang of trap met precies twee kanten (A en B), in dezelfde wereld.
// De server beslist alles: of je dichtbij genoeg bent, of je erdoor mag (vlag, sleutel, level, gevecht) en waar je
// aankomt. De game vraagt alleen "gebruik kant A van doorgang X". Geen tabel: een doorgang onthoudt niets per speler.

import { areaOutlineMeters } from "../../../apps/web/public/shared/spatial.js";

// Wat de server extra toestaat bovenop "Gebruiken binnen" (de game ziet je net iets eerder dan de server).
export const DOORWAY_RANGE_SLACK_M = 1.5;

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function doorwaysOf(world) {
  return Array.isArray(world?.doorways) ? world.doorways.filter((door) => door && door.id && door.a && door.b) : [];
}

// "huis.bram:a" -> { id: "huis.bram", side: "a" }. Zonder kant = kant A.
export function parseDoorwayTarget(targetId) {
  const text = String(targetId || "").trim();
  const match = /^(.*):(a|b)$/.exec(text);
  return match ? { id: match[1], side: match[2] } : { id: text, side: "a" };
}

export function otherSide(side) {
  return side === "b" ? "a" : "b";
}

// Een doorgang met "Alleen als vlag" bestaat alleen voor wie die vlag (niet) heeft.
export function doorwayVisibleFor(door, playerId, flags) {
  return !door?.flag || !flags || flags.passes(playerId, door.flag);
}

export function distanceToSide(position, end) {
  if (!position || !end) return Infinity;
  return Math.hypot(num(position.x) - num(end.x), num(position.z) - num(end.z));
}

export function withinUseRange(position, door, side) {
  return distanceToSide(position, door?.[side]) <= Math.max(1, num(door?.useMeters, 2)) + DOORWAY_RANGE_SLACK_M;
}

// Aankomen: een paar meter voor de andere kant (de kant waar hij naartoe kijkt), met je gezicht van de deur af.
export function doorwayArrival(door, side) {
  const end = door?.[side] || {};
  const deg = num(end.rotationY);
  const rad = deg * Math.PI / 180;
  const meters = Math.max(0, num(door?.arriveMeters, 2.5));
  return { x: num(end.x) + Math.sin(rad) * meters, y: num(end.y), z: num(end.z) + Math.cos(rad) * meters, rotationY: deg };
}

// Mag deze speler van kant `side` door? Geeft een Nederlandse reden terug, of null als het mag.
// info: { position, level, keyCount, combatAgoMs }
export function doorwayRefusal(door, side, info = {}) {
  if (door.oneWay === true && side === "b") return "Deze doorgang gaat maar één kant op.";
  if (!withinUseRange(info.position, door, side)) return "Loop dichter naar " + (door.displayName || "de doorgang") + ".";
  const needLevel = Math.max(1, Math.round(num(door.minLevel, 1)));
  if (needLevel > 1 && num(info.level, 1) < needLevel) return (door.displayName || "Deze doorgang") + " kan pas vanaf level " + needLevel + ".";
  if (door.keyItemId && num(info.keyCount, 0) < 1) return "Je hebt " + (info.keyName || "een sleutel") + " nodig.";
  const blockMs = Math.max(0, num(door.combatBlockSeconds, 0)) * 1000;
  const ago = num(info.combatAgoMs, Infinity);
  if (blockMs > 0 && ago < blockMs) return "Je bent nog in gevecht. Dat kan over " + Math.ceil((blockMs - ago) / 1000) + " s.";
  return null;
}

// Binnenruimtes (22-11): bij welk binnen-gebied hoort welke plek buiten? De kant van een doorgang die in het gebied
// staat is de binnenkant; de andere kant is buiten. areaIdAt(x, z) geeft het deelgebied op een plek (of null).
// Uitkomst: Map areaId -> { x, y, z, rotationY, doorwayId } (de aankomstplek buiten).
export function outsidePointsByArea(doorways, indoorAreaIds, areaIdAt) {
  const result = new Map();
  if (!indoorAreaIds || !indoorAreaIds.size) return result;
  const links = [];
  for (const door of doorways) {
    const areaOf = { a: areaIdAt(num(door.a.x), num(door.a.z)), b: areaIdAt(num(door.b.x), num(door.b.z)) };
    for (const side of ["a", "b"]) {
      const areaId = areaOf[side];
      if (!areaId || !indoorAreaIds.has(areaId)) continue;
      const out = otherSide(side);
      links.push({ areaId, toArea: areaOf[out] && indoorAreaIds.has(areaOf[out]) ? areaOf[out] : null, point: Object.assign(doorwayArrival(door, out), { doorwayId: door.id }) });
    }
  }
  // Eerst de deuren die direct naar buiten gaan; daarna (citadel) een etage via de trap naar een etage die al een buiten-plek heeft.
  for (const link of links) if (!link.toArea && !result.has(link.areaId)) result.set(link.areaId, link.point);
  for (let pass = 0; pass < 16; pass += 1) {
    let added = false;
    for (const link of links) {
      if (!link.toArea || result.has(link.areaId) || !result.has(link.toArea)) continue;
      result.set(link.areaId, result.get(link.toArea));
      added = true;
    }
    if (!added) break;
  }
  return result;
}

// Binnenruimtes (22-11): de instellingen van een deelgebied met 🏠 Binnen voor de game (null = buiten).
export function indoorSettingsOf(area) {
  if (area?.indoor !== true) return null;
  const clampNum = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
  return {
    // Kevin 23-11: van boven alleen als het deelgebied dat vraagt; anders de eigen camera van de speler.
    topDown: area.indoorTopDown === true,
    cameraDistance: clampNum(area.indoorCameraDistance, 16, 4, 80),
    cameraPitch: clampNum(area.indoorCameraPitch, 65, 30, 89),
    background: /^#[0-9a-f]{6}$/i.test(String(area.indoorBackground || "")) ? area.indoorBackground : "#000000",
    light: clampNum(area.indoorLight, 80, 0, 200) / 100,
    sun: clampNum(area.indoorSun, 20, 0, 100) / 100,
    // Kevin 23-11: de rand van het gebied; de game maakt alles erbuiten zwart (de kleur hierboven).
    outline: areaOutlineMeters(area),
    // Kevin 23-11: de vloer (terreintextuur, "terrain_texture:<id>"); met een vloer laat de game het terrein weg.
    floor: typeof area.indoorFloorRef === "string" && area.indoorFloorRef ? area.indoorFloorRef : null
  };
}
