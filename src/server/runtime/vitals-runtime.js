// Healing (2-11): levens en mana van spelers, één keer per seconde in de worldtick (zuinig voor de oude laptop).
// - Regeneratie per klasse (% per seconde), pas na X seconden zonder gevecht (Instellingen > Genezen en effecten).
// - Tijdelijke effecten: % levens/mana om de X seconden (eten, gif); verlopen effecten gaan weg, ook als je offline was.
// - Na een verandering krijgt alleen de speler zelf een klein "vitals"-bericht (balken, effect-icoontjes, zwevende getallen).
import { pctStep, regenStep, ticksBetween } from "../../../apps/web/public/shared/effect-math.js";
import { clearEffectsForDeath, combatRulesFromProject, itemCooldowns, loadActiveEffects, publicEffects } from "./player-effects.js";

const TICK_MS = 1000;
const CLASS_CACHE_MS = 10000;
const HEALTH = "stat.health";
const MANA = "stat.mana";

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// host: { db, project(), playerStates(worldId), isOnline(pid, wid), connectionFor(pid, wid), send(connection, payload), onDefeat(pid, wid) }
export class VitalsRuntime {
  constructor(host) {
    this.host = host;
    this.combatAt = new Map();
    this.carry = new Map();
    this.sent = new Map();
    this.classCache = new Map();
    this.lastTickAtMs = 0;
    this.perf = { ticks: 0, writes: 0, pushes: 0 };
  }

  // Een klap geven of krijgen: regeneratie wacht weer even.
  markCombat(playerId, nowMs = Date.now()) {
    if (playerId) this.combatAt.set(playerId, nowMs);
  }

  inCombat(playerId, nowMs, rules) {
    return nowMs - (this.combatAt.get(playerId) || 0) < rules.regenDelayMs;
  }

  project() {
    try { return this.host.project() || {}; } catch { return {}; }
  }

  classOf(playerId, catalogs, nowMs) {
    const cached = this.classCache.get(playerId);
    if (cached && nowMs - cached.at < CLASS_CACHE_MS) return cached.character;
    let classId = null;
    try { classId = this.host.db.prepare("SELECT selected_character_id FROM player_profiles WHERE id = ? LIMIT 1").get(playerId)?.selected_character_id || null; } catch {}
    const characters = catalogs?.playableCharacters || {};
    const character = (classId && characters[classId]) || Object.values(characters)[0] || {};
    this.classCache.set(playerId, { at: nowMs, character });
    return character;
  }

  readVitals(playerId) {
    const rows = this.host.db.prepare("SELECT stat_id, base_value, earned_value, current_value FROM player_stats WHERE player_id = ? AND stat_id IN (?, ?)").all(playerId, HEALTH, MANA);
    const out = {};
    for (const row of rows) {
      const max = num(row.base_value) + num(row.earned_value);
      out[row.stat_id] = { max, current: row.current_value === null || row.current_value === undefined ? max : num(row.current_value, max) };
    }
    return out;
  }

  tick(worldId, nowMs = Date.now()) {
    if (this.lastTickAtMs && nowMs - this.lastTickAtMs < TICK_MS) return;
    const seconds = this.lastTickAtMs ? Math.min(3, Math.max(1, (nowMs - this.lastTickAtMs) / 1000)) : 1;
    this.lastTickAtMs = nowMs;
    this.perf.ticks += 1;
    const project = this.project();
    const catalogs = project.catalogs || {};
    const rules = combatRulesFromProject(project);
    const seen = new Set();
    for (const state of this.host.playerStates(worldId) || []) {
      const playerId = state?.player_id;
      if (!playerId || seen.has(playerId) || !this.host.isOnline(playerId, worldId)) continue;
      seen.add(playerId);
      try {
        this.tickPlayer(playerId, worldId, nowMs, seconds, catalogs, rules);
      } catch (error) {
        console.error("[vitals] tick mislukt:", error.message);
      }
    }
    // Wie weg is, hoeft niet onthouden te worden (de effecten zelf staan in de database).
    for (const map of [this.sent, this.carry, this.combatAt]) for (const id of Array.from(map.keys())) if (!seen.has(id)) map.delete(id);
  }

  tickPlayer(playerId, worldId, nowMs, seconds, catalogs, rules) {
    const db = this.host.db;
    const vitals = this.readVitals(playerId);
    const health = vitals[HEALTH];
    if (!health) return;
    const mana = vitals[MANA] || { max: 0, current: 0 };
    const effects = loadActiveEffects(db, playerId, nowMs);
    const fx = [];
    let hp = health.current;
    let mp = mana.current;
    if (hp > 0) {
      let dHp = 0;
      let dMp = 0;
      const carry = this.carry.get(playerId) || { hp: 0, mp: 0, fx: {} };
      if (!carry.fx) carry.fx = {};
      const fromMs = nowMs - seconds * 1000;
      for (const entry of effects) {
        const effect = entry.effect || {};
        // Oude vorm (5104399): vaste levens/mana per seconde.
        dHp += Math.trunc(num(effect.healthPerS) * seconds);
        dMp += Math.trunc(num(effect.manaPerS) * seconds);
        // 2-11: procent van je max om de X seconden (alleen online; de duur loopt wel altijd door).
        const times = ticksBetween(entry.startedAtMs, effect.tickMs || 1000, fromMs, Math.min(nowMs, entry.endsAtMs));
        if (times <= 0) continue;
        if (num(effect.healthPctBp)) {
          const step = pctStep(health.max, effect.healthPctBp, carry.fx[entry.key + "|hp"] || 0, times);
          carry.fx[entry.key + "|hp"] = step.carry;
          dHp += step.amount;
        }
        if (num(effect.manaPctBp)) {
          const step = pctStep(mana.max, effect.manaPctBp, carry.fx[entry.key + "|mp"] || 0, times);
          carry.fx[entry.key + "|mp"] = step.carry;
          dMp += step.amount;
        }
      }
      for (const key of Object.keys(carry.fx)) if (!effects.some((entry) => key.startsWith(entry.key + "|"))) delete carry.fx[key];
      if (!this.inCombat(playerId, nowMs, rules)) {
        const character = this.classOf(playerId, catalogs, nowMs);
        if (hp < health.max) {
          const step = regenStep(health.max, character.healthRegenBp, carry.hp, seconds);
          dHp += step.amount;
          carry.hp = step.carry;
        } else carry.hp = 0;
        if (mp < mana.max) {
          const step = regenStep(mana.max, character.manaRegenBp, carry.mp, seconds);
          dMp += step.amount;
          carry.mp = step.carry;
        } else carry.mp = 0;
      }
      this.carry.set(playerId, carry);
      const nextHp = Math.max(0, Math.min(health.max, hp + dHp));
      const nextMp = Math.max(0, Math.min(mana.max, mp + dMp));
      if (nextHp !== hp) fx.push({ t: "hp", n: Math.round(nextHp - hp) });
      if (nextMp !== mp && vitals[MANA]) fx.push({ t: "mp", n: Math.round(nextMp - mp) });
      if (fx.length) {
        const stamp = new Date().toISOString();
        const write = db.prepare("UPDATE player_stats SET current_value = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND stat_id = ?");
        if (nextHp !== hp) write.run(nextHp, stamp, playerId, HEALTH);
        if (nextMp !== mp && vitals[MANA]) write.run(nextMp, stamp, playerId, MANA);
        this.perf.writes += 1;
      }
      // Gif kan je verslaan: zelfde stop als bij een klap van een vijand.
      if (nextHp <= 0 && hp > 0) {
        clearEffectsForDeath(db, playerId, rules);
        try { this.host.onDefeat(playerId, worldId); } catch {}
      }
      hp = nextHp;
      mp = nextMp;
    }
    this.push(playerId, worldId, nowMs, { hp, hpMax: health.max, mp, mpMax: mana.max }, fx);
  }

  // Stuurt de stand naar de speler, alleen als er iets veranderde (of force).
  push(playerId, worldId, nowMs, vitals = null, fx = [], force = false) {
    const db = this.host.db;
    const state = vitals || (() => {
      const read = this.readVitals(playerId);
      return { hp: read[HEALTH]?.current || 0, hpMax: read[HEALTH]?.max || 0, mp: read[MANA]?.current || 0, mpMax: read[MANA]?.max || 0 };
    })();
    const effects = publicEffects(loadActiveEffects(db, playerId, nowMs), nowMs);
    const cooldowns = itemCooldowns(db, playerId, nowMs);
    const signature = [state.hp, state.hpMax, state.mp, state.mpMax, effects.map((entry) => entry.key + "@" + Math.round((nowMs + entry.leftMs) / 1000)).join(","), Object.keys(cooldowns).join(",")].join("|");
    if (!force && !fx.length && this.sent.get(playerId) === signature) return false;
    this.sent.set(playerId, signature);
    const connection = this.host.connectionFor(playerId, worldId);
    if (!connection) return false;
    this.host.send(connection, {
      type: "vitals", serverTimeMs: nowMs,
      health: { current: state.hp, max: state.hpMax }, mana: { current: state.mp, max: state.mpMax },
      effects, itemCooldowns: cooldowns, fx
    });
    this.perf.pushes += 1;
    return true;
  }

  snapshotForDebug() {
    return Object.assign({ players: this.sent.size, inCombat: this.combatAt.size }, this.perf);
  }
}
