// Fase 05 (F5-E2-T01): deterministische gevechtswiskunde in gehele getallen (basispunten, mm, ms).
// Zelfde invoer => zelfde uitkomst op server, in de editor-preview en in tests. Geen Math.random, geen
// floats in de formule. Server en browser gebruiken dit ene bestand.

export const COMBAT_MATH_VERSION = "gk-combat-math-1";
export const BP = 10000; // 10000 basispunten = 100 %
export const MAX_STAT = 1000000;
export const MAX_BP = 100000;
export const MAX_DAMAGE = 10000000;
export const MAX_LOOT_DEPTH = 4;

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

// Afronden naar beneden (richting -oneindig), ook voor negatieve tellers.
export function floorDiv(a, b) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || b === 0) throw new RangeError("floorDiv vraagt veilige gehele getallen");
  let q = Math.trunc(a / b);
  let r = a - q * b;
  while (Math.abs(r) >= Math.abs(b)) {
    const step = Math.sign(r) * Math.sign(b);
    q += step;
    r -= step * b;
  }
  if (r !== 0 && (r < 0) !== (b < 0)) q -= 1;
  return q;
}

// n/d afgerond met .5 omhoog (zoals Math.round), exact in gehele getallen. d > 0.
export function roundHalfUpDiv(n, d) {
  return floorDiv(2 * n + d, 2 * d);
}

// Schade = base + aanvalskracht * schaal - pantser * factor, minimaal 1.
// ability: { baseDamage, powerScalingBp, armorFactorBp }.
export function computeDamage(ability, attackPower, armor) {
  const base = clampInt(ability?.baseDamage, 0, MAX_STAT);
  const scaling = clampInt(ability?.powerScalingBp, 0, MAX_BP);
  const armorFactor = clampInt(ability?.armorFactorBp, 0, MAX_BP);
  const ap = clampInt(attackPower, 0, MAX_STAT);
  const ar = clampInt(armor, 0, MAX_STAT);
  const raw = roundHalfUpDiv(base * BP + ap * scaling - ar * armorFactor, BP);
  return Math.min(MAX_DAMAGE, Math.max(1, raw));
}

// De oude NODE-03 formules, uitgedrukt in dezelfde rekenregel (pariteit met legacy).
export const LEGACY_PLAYER_ATTACK = Object.freeze({ baseDamage: 16, powerScalingBp: 5000, armorFactorBp: 3500 });
export const LEGACY_ENEMY_RETALIATION = Object.freeze({ baseDamage: 8, powerScalingBp: 3500, armorFactorBp: 2500 });

// Gehele afstand in mm (afgerond naar beneden). Alleen voor bereik-checks; geen floats in de uitkomst.
export function distanceMm(ax, az, bx, bz) {
  const dx = Math.trunc(ax) - Math.trunc(bx);
  const dz = Math.trunc(az) - Math.trunc(bz);
  return Math.floor(Math.sqrt(dx * dx + dz * dz));
}

export function withinRangeMm(ax, az, bx, bz, rangeMm) {
  const dx = Math.trunc(ax) - Math.trunc(bx);
  const dz = Math.trunc(az) - Math.trunc(bz);
  const r = Math.max(0, Math.trunc(rangeMm));
  return dx * dx + dz * dz <= r * r;
}

// --- Zaaibare RNG: xmur3 (string -> seed) + sfc32. Zelfde seedtekst => zelfde reeks, op elke machine.
function xmur3(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function createRng(seedText) {
  const seed = xmur3(String(seedText));
  let a = seed();
  let b = seed();
  let c = seed();
  let d = seed();
  function nextUint32() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  }
  for (let i = 0; i < 12; i += 1) nextUint32();
  // Zuiver geheel getal in [0, max) zonder modulo-scheefheid (rejection sampling).
  function nextInt(max) {
    const m = Math.trunc(max);
    if (!(m > 0) || m > 0x100000000) throw new RangeError("nextInt: max moet 1..2^32 zijn");
    const limit = 0x100000000 - (0x100000000 % m);
    let value = nextUint32();
    while (value >= limit) value = nextUint32();
    return value % m;
  }
  return { nextUint32, nextInt };
}

export function lootSeed(buildId, instanceId, characterId) {
  return "loot|" + String(buildId || "") + "|" + String(instanceId || "") + "|" + String(characterId || "");
}

// tables: { [lootTableId]: { entries: [{ itemId?, lootTableId?, chanceBp, minQty, maxQty }] } }
// Elke regel rolt apart: kans in basispunten, aantal min..max. Geneste tabellen max MAX_LOOT_DEPTH diep.
// Uitkomst: [{ itemId, quantity }] samengevoegd per item, in volgorde van eerste voorkomen.
export function rollLoot(tables, lootTableId, seedText) {
  const rng = createRng(seedText);
  const totals = new Map();
  const visit = (tableId, depth, stack) => {
    const table = tables && tables[tableId];
    if (!table || depth > MAX_LOOT_DEPTH || stack.includes(tableId)) return;
    const nextStack = stack.concat(tableId);
    for (const entry of Array.isArray(table.entries) ? table.entries : []) {
      const chance = clampInt(entry.chanceBp, 0, BP);
      if (rng.nextInt(BP) >= chance) continue;
      const min = clampInt(entry.minQty, 1, 9999);
      const max = Math.max(min, clampInt(entry.maxQty, 1, 9999));
      const quantity = min + rng.nextInt(max - min + 1);
      if (entry.lootTableId) {
        for (let i = 0; i < quantity; i += 1) visit(entry.lootTableId, depth + 1, nextStack);
      } else if (entry.itemId) {
        totals.set(entry.itemId, (totals.get(entry.itemId) || 0) + quantity);
      }
    }
  };
  visit(lootTableId, 1, []);
  return Array.from(totals, ([itemId, quantity]) => ({ itemId, quantity }));
}
