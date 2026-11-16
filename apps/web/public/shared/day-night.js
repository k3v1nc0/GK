// Werkbank Fase 10 (keuze van Kevin 15-11): dag en nacht. Eén klok voor iedereen, gerekend uit de tijd van de server:
// eerst [dayMinutes] dag, dan [nightMinutes] nacht, steeds opnieuw (vanaf 1-1-1970 UTC, dus overal gelijk).
// De server gebruikt isDay (winkel open of dicht, NPC's); de game kleurt het licht met light (0 = diepe nacht, 1 = dag).

// Hoe lang de overgang (schemer) duurt aan elke kant: 10 % van de kortste helft, hooguit 5 minuten.
const FADE_MAX_MS = 5 * 60000;

export function dayNightConfig(source = {}) {
  const dayMinutes = Math.max(1, Math.round(Number(source?.dayMinutes) || 60));
  const nightRaw = Number(source?.nightMinutes);
  const nightMinutes = Number.isFinite(nightRaw) ? Math.max(0, Math.round(nightRaw)) : 60;
  const nightLightPct = Math.max(5, Math.min(100, Math.round(Number(source?.nightLightPct) || 35)));
  return { dayMinutes, nightMinutes, nightLightPct };
}

export function dayNightState(nowMs, source = {}) {
  const cfg = dayNightConfig(source);
  const dayMs = cfg.dayMinutes * 60000;
  const nightMs = cfg.nightMinutes * 60000;
  if (!nightMs) return { isDay: true, light: 1, msToSwitch: Infinity, nightLight: cfg.nightLightPct / 100 };
  const cycle = dayMs + nightMs;
  const t = ((Number(nowMs) || 0) % cycle + cycle) % cycle;
  const isDay = t < dayMs;
  const fade = Math.min(FADE_MAX_MS, Math.round(Math.min(dayMs, nightMs) * 0.1));
  const nightLight = cfg.nightLightPct / 100;
  // 1 overdag, nightLight 's nachts; in de schemer (fade aan het eind van elke helft) loopt het rustig over.
  let light = isDay ? 1 : nightLight;
  const intoPhase = isDay ? t : t - dayMs;
  const phaseLen = isDay ? dayMs : nightMs;
  const left = phaseLen - intoPhase;
  if (fade > 0 && left < fade) {
    const k = 1 - left / fade; // 0 -> 1 tegen het eind van deze helft
    light = isDay ? 1 - (1 - nightLight) * k : nightLight + (1 - nightLight) * k;
  }
  return { isDay, light, msToSwitch: left, nightLight };
}

// Mengt twee #rrggbb-kleuren (k = 0 geeft a, k = 1 geeft b).
export function mixColor(a, b, k) {
  const parse = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "")); const n = m ? parseInt(m[1], 16) : 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const x = parse(a);
  const y = parse(b);
  const f = Math.max(0, Math.min(1, Number(k) || 0));
  return "#" + x.map((value, index) => Math.round(value + (y[index] - value) * f).toString(16).padStart(2, "0")).join("");
}
