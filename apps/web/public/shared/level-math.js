// Werkbank Fase 6: level-wiskunde die de server, de editor en de tests delen. Alleen gehele getallen.
// - XP-curve: punten [level, XP die dat level kost]; ertussen een rechte lijn, ervoor en erna de eerste/laatste waarde.
// - Groei: een klasse-stat op een level = basis + groei per level.
// - Schaling: tegen een vijand telt iedereen als het level van die vijand; het schuifje geeft per level verschil
//   een beetje voordeel (hoger) of nadeel (lager), tot een maximum.

export const XP_CURVE_MAX_POINTS = 24;
export const LEVEL_LIMIT = 500;

// Maakt de punten netjes: hele getallen, level 1..maxLevel, oplopend, één punt per level (het laatste wint).
export function cleanXpCurve(points, maxLevel = LEVEL_LIMIT) {
  const cap = Math.max(1, Math.min(LEVEL_LIMIT, Math.round(Number(maxLevel)) || LEVEL_LIMIT));
  const byLevel = new Map();
  for (const point of Array.isArray(points) ? points : []) {
    if (!Array.isArray(point)) continue;
    const level = Math.round(Number(point[0]));
    const cost = Math.round(Number(point[1]));
    if (!Number.isFinite(level) || !Number.isFinite(cost)) continue;
    byLevel.set(Math.max(1, Math.min(cap, level)), Math.max(1, cost));
  }
  return Array.from(byLevel.entries()).sort((a, b) => a[0] - b[0]);
}

// Hoeveel XP kost het om van dit level naar het volgende te gaan? clean = uitkomst van cleanXpCurve.
export function xpCostAt(clean, level, fallback = 100) {
  if (!clean.length) return Math.max(1, Math.round(Number(fallback)) || 100);
  if (level <= clean[0][0]) return clean[0][1];
  for (let index = 1; index < clean.length; index += 1) {
    const before = clean[index - 1];
    const after = clean[index];
    if (level > after[0]) continue;
    return Math.max(1, Math.round(before[1] + (after[1] - before[1]) * (level - before[0]) / (after[0] - before[0])));
  }
  return clean[clean.length - 1][1];
}

// Totaal XP om elk level te halen: totals[level], voor level 1 t/m maxLevel + 1 (totals[1] = 0).
export function xpTotals(points, maxLevel, fallback = 100) {
  const cap = Math.max(1, Math.min(LEVEL_LIMIT, Math.round(Number(maxLevel)) || 1));
  const clean = cleanXpCurve(points, cap);
  const totals = [0, 0];
  let sum = 0;
  for (let level = 1; level <= cap; level += 1) {
    sum += xpCostAt(clean, level, fallback);
    totals[level + 1] = sum;
  }
  return totals;
}

// Klasse-stat op een level: basis + groei per level (level 1 = de basis).
export function statAtLevel(base, perLevel, level) {
  const steps = Math.max(1, Math.round(Number(level)) || 1) - 1;
  return Math.max(0, (Number(base) || 0) + (Number(perLevel) || 0) * steps);
}

// Schuifje "Verschil per level": hoeveel procent voordeel (plus) of nadeel (min) dit levelverschil geeft.
export function levelEdgePct(playerLevel, enemyLevel, perLevelPct, maxPct) {
  const cap = Math.max(0, Number(maxPct) || 0);
  const raw = ((Number(playerLevel) || 1) - (Number(enemyLevel) || 1)) * Math.max(0, Number(perLevelPct) || 0);
  return Math.max(-cap, Math.min(cap, raw));
}

// Uitrusting "vanaf level N" telt tegen een vijand van een lager level naar verhouding mee (N of hoger: helemaal).
export function equipBonusAt(bonus, requiredLevel, level) {
  const need = Math.max(1, Math.round(Number(requiredLevel)) || 1);
  const at = Math.max(1, Math.round(Number(level)) || 1);
  if (at >= need) return bonus;
  return Math.round(bonus * at / need);
}

// Schade of genezing omrekenen naar de echte balk: hetzelfde deel van de balk als op het getelde level.
export function toRealPool(amount, realMax, countedMax) {
  if (!(countedMax > 0) || !(realMax > 0) || realMax === countedMax) return Math.max(0, Math.round(amount));
  return Math.max(amount > 0 ? 1 : 0, Math.round(amount * realMax / countedMax));
}
