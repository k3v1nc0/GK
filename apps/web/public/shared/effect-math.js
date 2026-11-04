// Healing en tijdelijke effecten (2-11): één rekenregel voor server, editor en HUD.
// Een effect komt van een item (broodje: 5 min meer kracht) of van een aanval (gif van een vijand, genezing over tijd).
// Alles in gehele getallen; tijd in echte milliseconden (5 uur = 5 uur, ook offline).

export const EFFECT_MATH_VERSION = "gk-effects-1";
export const BP = 10000;
export const EFFECT_MAX_DURATION_MS = 7 * 24 * 3600 * 1000;

// De velden die een item of aanval voor zijn effect gebruikt (zelfde namen in beide kaarten).
export const EFFECT_FIELD_KEYS = Object.freeze([
  "effectName", "effectIconAssetId", "effectDurationS", "effectAttackPower", "effectArmor", "effectHealPower", "effectHealthPctBp", "effectManaPctBp", "effectTickS"
]);
// healthPctBp / manaPctBp: procent van je max (basispunten, 100 = 1 %) om de tickMs. healthPerS/manaPerS: oude vorm (5104399), blijft werken.
export const EFFECT_STAT_KEYS = Object.freeze(["attackPower", "armor", "healPower", "healthPctBp", "manaPctBp", "healthPerS", "manaPerS"]);
export const STACKING_MODES = Object.freeze(["refresh", "extend", "block"]);

function int(value, fallback = 0) {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

// Item- of aanvalvelden -> effect, of null als er niets te doen is (geen duur of alles 0).
export function effectFromSource(source, fallbackName = "") {
  if (!source || typeof source !== "object") return null;
  const durationMs = Math.min(EFFECT_MAX_DURATION_MS, Math.max(0, int(source.effectDurationS) * 1000));
  const effect = {
    name: String(source.effectName || fallbackName || "Effect").slice(0, 80),
    iconAssetId: source.effectIconAssetId || null,
    durationMs,
    attackPower: int(source.effectAttackPower),
    armor: int(source.effectArmor),
    healPower: int(source.effectHealPower),
    healthPctBp: int(source.effectHealthPctBp),
    manaPctBp: int(source.effectManaPctBp),
    tickMs: Math.max(1, int(source.effectTickS, 1) || 1) * 1000
  };
  if (durationMs <= 0 || EFFECT_STAT_KEYS.every((key) => !int(effect[key]))) return null;
  return effect;
}

// Goed of slecht: slecht = iets gaat omlaag (gif, bloeden, minder pantser). Slecht gaat altijd weg bij doodgaan.
export function isGoodEffect(effect) {
  if (!effect) return true;
  return EFFECT_STAT_KEYS.every((key) => int(effect[key]) >= 0);
}

const plus = (n) => (n > 0 ? "+" + n : String(n));

// Korte regels voor de HUD en de tas, bijv. ["+5 kracht", "+2 levens per seconde"].
export function describeEffect(effect) {
  if (!effect) return [];
  const lines = [];
  if (int(effect.attackPower)) lines.push(plus(int(effect.attackPower)) + " kracht");
  if (int(effect.armor)) lines.push(plus(int(effect.armor)) + " pantser");
  if (int(effect.healPower)) lines.push(plus(int(effect.healPower)) + " heal-kracht");
  const every = " om de " + Math.max(1, Math.round(int(effect.tickMs, 1000) / 1000)) + " s";
  const pct = (bp) => (Math.round(Math.abs(bp)) / 100).toLocaleString("nl-NL") + " %";
  if (int(effect.healthPctBp) > 0) lines.push("+" + pct(effect.healthPctBp) + " levens" + every);
  if (int(effect.healthPctBp) < 0) lines.push("-" + pct(effect.healthPctBp) + " levens" + every + " (gif)");
  if (int(effect.manaPctBp) > 0) lines.push("+" + pct(effect.manaPctBp) + " mana" + every);
  if (int(effect.manaPctBp) < 0) lines.push("-" + pct(effect.manaPctBp) + " mana" + every);
  if (int(effect.healthPerS) > 0) lines.push("+" + int(effect.healthPerS) + " levens per seconde");
  if (int(effect.healthPerS) < 0) lines.push(int(effect.healthPerS) + " levens per seconde (gif)");
  if (int(effect.manaPerS)) lines.push(plus(int(effect.manaPerS)) + " mana per seconde");
  return lines;
}

// 90000 -> "1:30", 5400000 -> "1u 30m".
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(Number(ms) / 1000) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + "u " + String(minutes).padStart(2, "0") + "m";
  if (minutes >= 10) return minutes + "m";
  return minutes + ":" + String(seconds).padStart(2, "0");
}

// Optelsom van de actieve effecten (kracht, pantser, heal-kracht).
export function effectBonuses(effects) {
  const sum = { attackPower: 0, armor: 0, healPower: 0 };
  for (const entry of Array.isArray(effects) ? effects : []) {
    const effect = entry?.effect || entry;
    sum.attackPower += int(effect?.attackPower);
    sum.armor += int(effect?.armor);
    sum.healPower += int(effect?.healPower);
  }
  return sum;
}

// Genezing van een genees-aanval: basis + heal-kracht * "telt mee" (basispunten), minimaal 1.
export function computeHeal(ability, healPower) {
  const base = Math.max(0, int(ability?.baseHeal));
  const scaling = Math.max(0, int(ability?.healScalingBp, BP));
  const power = Math.max(0, int(healPower));
  return Math.max(1, Math.floor((base * BP + power * scaling + BP / 2) / BP));
}

// Regeneratie per seconde: max * bp / 10000, met een "rest" (in basispunten) zodat 0,6 per seconde ook echt optelt.
// Geeft { amount (geheel), carry (rest voor de volgende seconde) }. Gehele getallen: geen afrondfouten.
export function regenStep(max, bpPerSecond, carry = 0, seconds = 1) {
  const bp = Math.max(0, int(bpPerSecond));
  const top = Math.max(0, Math.floor(Number(max) || 0));
  if (bp <= 0 || top <= 0) return { amount: 0, carry: 0 };
  const rest = Math.max(0, Math.min(BP - 1, int(carry)));
  const numerator = Math.round(top * bp * Math.max(0, Number(seconds) || 0)) + rest;
  const amount = Math.floor(numerator / BP);
  return { amount, carry: numerator - amount * BP };
}

// Hoeveel keer een "om de X s"-effect afging tussen fromMs en toMs (gerekend vanaf de start van het effect).
export function ticksBetween(startedAtMs, tickMs, fromMs, toMs) {
  const tick = Math.max(1000, int(tickMs, 1000));
  const from = Math.max(Number(startedAtMs) || 0, Number(fromMs) || 0);
  const to = Number(toMs) || 0;
  if (to <= from) return 0;
  return Math.max(0, Math.floor((to - startedAtMs) / tick) - Math.floor((from - startedAtMs) / tick));
}

// Procent van max per keer (basispunten, min = eraf), met rest zodat 0,5 per keer ook optelt.
export function pctStep(max, bp, carry = 0, times = 1) {
  const sign = int(bp) < 0 ? -1 : 1;
  const step = regenStep(max, Math.abs(int(bp)), carry, times);
  return { amount: sign * step.amount, carry: step.carry };
}
