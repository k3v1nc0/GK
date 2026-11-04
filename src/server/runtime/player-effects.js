// Healing (2-11): tijdelijke effecten en item-wachttijden van spelers in de database.
// Alleen de server beslist: een effect heeft een eindtijd in echte ms (ook offline loopt de tijd door).
// Puur database-werk zonder geheugen, zodat het in dezelfde transactie als het gebruiken van een item past.
import { describeEffect, effectBonuses, isGoodEffect } from "../../../apps/web/public/shared/effect-math.js";

export const DEFAULT_COMBAT_RULES = Object.freeze({
  regenDelayMs: 5000, effectStacking: "refresh", maxEffects: 8, clearBuffsOnDeath: true, levelUpRestore: true
});

// De regels uit de spelwereld (kaart Instellingen > Genezen en effecten), met standaard als die er niet is.
export function combatRulesFromProject(project) {
  const rule = project?.playerRules?.byType?.combat_rules?.[0] || {};
  return {
    regenDelayMs: Number.isFinite(Number(rule.regenDelayMs)) ? Math.max(0, Number(rule.regenDelayMs)) : DEFAULT_COMBAT_RULES.regenDelayMs,
    effectStacking: ["refresh", "extend", "block"].includes(rule.effectStacking) ? rule.effectStacking : DEFAULT_COMBAT_RULES.effectStacking,
    maxEffects: Math.max(1, Number(rule.maxEffects) || DEFAULT_COMBAT_RULES.maxEffects),
    clearBuffsOnDeath: rule.clearBuffsOnDeath !== false,
    levelUpRestore: rule.levelUpRestore !== false
  };
}

function nowIso() {
  return new Date().toISOString();
}

function rowToEffect(row) {
  let effect = {};
  try { effect = JSON.parse(row.effect_json) || {}; } catch {}
  return {
    key: row.effect_key, sourceKind: row.source_kind, sourceId: row.source_id, good: row.good === 1 || row.good === true,
    effect, startedAtMs: Number(row.started_at_ms), endsAtMs: Number(row.ends_at_ms)
  };
}

// Actieve effecten van een speler; verlopen effecten worden meteen opgeruimd.
export function loadActiveEffects(db, playerId, nowMs = Date.now()) {
  try {
    db.prepare("DELETE FROM player_effects WHERE player_id = ? AND ends_at_ms <= ?").run(playerId, nowMs);
    return db.prepare("SELECT * FROM player_effects WHERE player_id = ? ORDER BY started_at_ms, effect_key").all(playerId).map(rowToEffect);
  } catch {
    return []; // migratie 019 nog niet gedraaid
  }
}

export function effectKeyFor(sourceKind, sourceId) {
  return String(sourceKind) + ":" + String(sourceId);
}

// Kan dit effect erbij? Zelfde regels als applyEffect, maar zonder te schrijven.
// Geeft { ok, reason, endsAtMs, replaces }.
export function planEffect(db, playerId, { sourceKind, sourceId, effect }, nowMs, rules = DEFAULT_COMBAT_RULES) {
  if (!effect || !(effect.durationMs > 0)) return { ok: false, reason: "Geen effect." };
  const key = effectKeyFor(sourceKind, sourceId);
  const active = loadActiveEffects(db, playerId, nowMs);
  const existing = active.find((entry) => entry.key === key) || null;
  if (existing) {
    if (rules.effectStacking === "block") return { ok: false, reason: (effect.name || "Dit effect") + " werkt nog (" + Math.ceil((existing.endsAtMs - nowMs) / 1000) + " s)." };
    const endsAtMs = rules.effectStacking === "extend" ? existing.endsAtMs + effect.durationMs : nowMs + effect.durationMs;
    return { ok: true, key, endsAtMs, replaces: true };
  }
  if (active.length >= rules.maxEffects) return { ok: false, reason: "Je hebt al " + active.length + " effecten tegelijk." };
  return { ok: true, key, endsAtMs: nowMs + effect.durationMs, replaces: false };
}

// Zet het effect op de speler (of ververst/verlengt het). Geeft het plan terug ({ ok: false } als het niet mag).
export function applyEffect(db, playerId, source, nowMs = Date.now(), rules = DEFAULT_COMBAT_RULES) {
  const plan = planEffect(db, playerId, source, nowMs, rules);
  if (!plan.ok) return plan;
  db.prepare(`
    INSERT INTO player_effects (player_id, effect_key, source_kind, source_id, good, effect_json, started_at_ms, ends_at_ms, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, effect_key) DO UPDATE SET good = excluded.good, effect_json = excluded.effect_json,
      ends_at_ms = excluded.ends_at_ms, updated_at = excluded.updated_at
  `).run(playerId, plan.key, String(source.sourceKind), String(source.sourceId), isGoodEffect(source.effect) ? 1 : 0,
    JSON.stringify(source.effect), nowMs, plan.endsAtMs, nowIso());
  return plan;
}

// Bij doodgaan: slechte effecten altijd weg, goede alleen als de regel dat zegt.
export function clearEffectsForDeath(db, playerId, rules = DEFAULT_COMBAT_RULES) {
  try {
    if (rules.clearBuffsOnDeath) db.prepare("DELETE FROM player_effects WHERE player_id = ?").run(playerId);
    else db.prepare("DELETE FROM player_effects WHERE player_id = ? AND good = 0").run(playerId);
  } catch {}
}

export function activeEffectBonuses(db, playerId, nowMs = Date.now()) {
  return effectBonuses(loadActiveEffects(db, playerId, nowMs));
}

// Wat de HUD krijgt: naam, icoon, goed/slecht, hoe lang nog en wat het doet.
export function publicEffects(effects, nowMs = Date.now()) {
  return (effects || []).map((entry) => ({
    key: entry.key,
    name: entry.effect?.name || "Effect",
    iconAssetId: entry.effect?.iconAssetId || null,
    good: entry.good,
    leftMs: Math.max(0, entry.endsAtMs - nowMs),
    durationMs: Math.max(1, Number(entry.effect?.durationMs) || entry.endsAtMs - entry.startedAtMs),
    lines: describeEffect(entry.effect)
  }));
}

// ---- wachttijd per item ----

export function itemReadyInMs(db, playerId, itemId, nowMs = Date.now()) {
  try {
    const row = db.prepare("SELECT ready_at_ms FROM player_item_cooldowns WHERE player_id = ? AND item_id = ? LIMIT 1").get(playerId, itemId);
    return row ? Math.max(0, Number(row.ready_at_ms) - nowMs) : 0;
  } catch {
    return 0;
  }
}

export function setItemCooldown(db, playerId, itemId, readyAtMs) {
  db.prepare(`
    INSERT INTO player_item_cooldowns (player_id, item_id, ready_at_ms) VALUES (?, ?, ?)
    ON CONFLICT(player_id, item_id) DO UPDATE SET ready_at_ms = excluded.ready_at_ms
  `).run(playerId, itemId, readyAtMs);
}

// { itemId: ms nog wachten } voor de tas.
export function itemCooldowns(db, playerId, nowMs = Date.now()) {
  try {
    const out = {};
    for (const row of db.prepare("SELECT item_id, ready_at_ms FROM player_item_cooldowns WHERE player_id = ? AND ready_at_ms > ?").all(playerId, nowMs)) {
      out[row.item_id] = Number(row.ready_at_ms) - nowMs;
    }
    return out;
  } catch {
    return {};
  }
}
