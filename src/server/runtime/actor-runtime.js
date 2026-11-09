// Fase 05 (F5-E1-T03 + F5-E2-T02/T03/T05): vijanden en grondstoffen uit de actieve build, server-authoritative.
// - AI op 10 Hz: stil / patrouille / aanvallen / terug naar huis / dood. Slaapt als er geen speler in de buurt is.
// - Beweging via dezelfde botsingsfunctie als spelers (resolveMovement); routes via navigation.js met een budget.
// - Spelersaanval en verzamelen: plan (puur) -> node03 schrijft in één transactie -> pas daarna in het geheugen.
// - Naar de game: actor:snapshot (alleen wat in de buurt is en veranderde) en actor:event.
// - Quest Builder stap 5: vijanden die een quest laat verschijnen (groepen voor speler, groep of iedereen). Eén servercheck
//   (canSeeGroup) in snapshots, gebeurtenissen, AI en aanvallen: wie ze niet mag zien, kan ze ook niet raken en wordt niet aangevallen.
//   Ze komen niet terug na de dood en worden nooit gekopieerd. De quest-motor (node04) zegt wie ze nog nodig heeft (questKeeper).
// - Quest Builder stap 8: begeleiden. Een NPC gaat mee (volgt of loopt zelf en wacht) als quest-groep met één vriendelijke "actor"
//   (escort). Vijanden vallen hem aan, spelers niet. Aangekomen of dood: de quest-motor hoort het (questEscortArrived / questEscortDown).
import { pointInArea } from "../../../apps/web/public/shared/quest-graph.js";
import { computeDamage, lootSeed, rollLoot, withinRangeMm } from "../../../apps/web/public/shared/combat-math.js";
import { metersToMm, resolveMembership } from "../../../apps/web/public/shared/spatial.js";
import { groundHeightAt, resolveMovement } from "../../../apps/web/public/shared/movement-kernel.js";
import { computeHeal, regenStep } from "../../../apps/web/public/shared/effect-math.js";
import { createNavigator } from "./navigation.js";
import { playerAbilityFromSection } from "../authoring/actor-compiler.js";

export const ACTOR_INSTANCE_PREFIX = "actor:";
export const RESOURCE_INSTANCE_PREFIX = "res:";
const AI_STEP_MS = 100;
const SNAPSHOT_MS = 100;
const FULL_SNAPSHOT_MS = 2000;
const AOI_M = 64;
const WAKE_M = 80;
const PATH_QUERIES_PER_STEP = 4;
const PATH_MAX_EXPANDED = 4000;
const PATH_CHECKS_PER_STEP = 24000;
const PATH_CHECKS_PER_QUERY = 12000;
const REPATH_INTERVAL_MS = 600;
const PATH_RETRY_MS = 1000;
const REPATH_DISTANCE_M = 1.5;
const PATH_FAILS_BEFORE_RETURN = 3;
const PATROL_PAUSE_MS = 2000;
const HOME_REACHED_M = 0.6;
const PLAYER_RADIUS_MM = 500;
const RANGE_SLACK_MM = 300;
const ATTACK_ANIM_MS = 600;
const REGEN_STEP_MS = 1000;
const HEAL_BELOW = 0.75; // een vijand-healer geneest pas onder 75 % levens
const QUEST_PREFIX = "qs.";
const QUEST_CORPSE_MS = 5000; // een verslagen quest-vijand blijft nog even liggen en is dan weg
const QUEST_KEEP_MS = 2000;
const QUEST_LOGOUT_GRACE_MS = 60000; // "Weg na uitloggen": even opnieuw verbinden houdt ze
// Stap 8: begeleiden.
const ESCORT_FOLLOW_M = 2.5;      // zo dichtbij blijft hij achter je staan
const ESCORT_RUN_M = 5;           // verder achter: hij rent (zo snel als jij sprint)
const ESCORT_LOST_M = 40;         // nog verder weg: hij komt naast je staan (laatste redmiddel)
const ESCORT_STUCK_MS = 3000;     // zo lang geen stap vooruit: naast je zetten
const ESCORT_WAIT_M = 12;         // Loopt zelf: is niemand zo dichtbij, dan wacht hij
const ESCORT_LEAVE_MS = 4000;     // klaar: hij blijft nog even staan en is dan weg
const ESCORT_REGEN_AFTER_MS = 8000; // niet geraakt: hij krijgt langzaam levens terug
const ESCORT_REGEN_PART = 0.02;   // per seconde 2 % van zijn levens
const ESCORT_PERSIST_MS = 10000;
// Loopt zelf: één hele route naar het gebied zoeken (ruimer dan een vijand per stap), en zonder route even later opnieuw.
const ESCORT_ROUTE_EXPANDED = 16000; const ESCORT_ROUTE_CHECKS = 60000; const ESCORT_ROUTE_RETRY_MS = 3000;  // zijn plek gaat zo vaak naar de database (herstart)
const ESCORT_RADIUS_MM = 500;     // zelfde maat als de meeste vijanden: dezelfde routekaart
const ESCORT_FIGHT_M = 10;        // Vecht mee: vijanden zo dicht bij hem of bij jullie
const ESCORT_HIT_MS = 1200;       // Vecht mee: een klap per 1,2 s
const ESCORT_REACH_M = 2.2;       // Vecht mee: zo dichtbij moet hij staan

const mm = (meters) => Math.round(Number(meters) * 1000);
const meters = (millimeters) => Number(millimeters) / 1000;
const r2 = (value) => Math.round(Number(value) * 100) / 100;

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

export function isActorInstanceId(id) {
  return String(id || "").startsWith(ACTOR_INSTANCE_PREFIX);
}

export function isResourceInstanceId(id) {
  return String(id || "").startsWith(RESOURCE_INSTANCE_PREFIX);
}

// host: { db, canonicalBuild(), worldContext(), spatial(), playerStates(worldId), isOnline(pid, wid), isDefeated(pid),
//         connections(worldId) -> [{ id, player: { id }, ws }], send(connection, payload), partyOf(playerId)? }
export class ActorRuntime {
  constructor(host) {
    this.host = host;
    this.bridge = null;
    this.buildId = null;
    this.section = null;
    this.worldId = null;
    this.worldContextRef = null;
    this.navigationRevision = null;
    this.actors = new Map(); // instance-id zonder occurrence (spawnKey) -> actor
    this.resources = new Map();
    this.navigators = new Map();
    this.pending = new Map();
    this.playerAttackAtMs = new Map();
    this.sentByConnection = new Map();
    this.accumulatorMs = 0;
    this.lastSnapshotAtMs = 0;
    this.lastStepAtMs = 0;
    this.regenAtMs = 0;
    // Stap 5: quest-groepen (id -> groep). questKeeper(groep) -> { open: [spelers met de quest open], need: [wie ze nog nodig heeft] };
    // questReleased(groep) = de regels mogen opnieuw (na uitloggen weg). Beide zet de quest-motor.
    this.questGroups = new Map();
    this.questGroupsWorld = null;
    this.questSeq = 0;
    this.questKeepAtMs = 0;
    this.questKeeper = null;
    this.questReleased = null;
    // Stap 8: de quest-motor hoort het als een begeleide NPC aankomt of doodgaat (na de AI-stap, niet midden erin).
    this.questEscortArrived = null;
    this.questEscortDown = null;
    this.escortNews = [];
    this.perf = { steps: 0, maxStepMs: 0, avgStepMs: 0, pathQueries: 0, pathBudgetHits: 0, snapshotsSent: 0 };
  }

  // node03: applyActorHit({ worldId, playerId, actorId, label, ability, attackPower }) -> { damage, remainingHealth, defeated } | null
  setCombatBridge(bridge) {
    this.bridge = bridge || null;
  }

  // ---- build laden ----------------------------------------------------------------------------------------

  ensureBuild(nowMs) {
    const canonical = this.host.canonicalBuild();
    const buildId = canonical?.buildId || null;
    let worldContext = null;
    try { worldContext = this.host.worldContext(); } catch { worldContext = null; }
    const navigationRevision = (worldContext?.collisionRevision || 0) + ":" + (worldContext?.walkabilityIndex?.heightfield?.revision || 0);
    if (worldContext !== this.worldContextRef || navigationRevision !== this.navigationRevision) {
      this.worldContextRef = worldContext;
      this.navigationRevision = navigationRevision;
      this.navigators.clear();
      for (const actor of this.actors.values()) {
        actor.path = []; actor.pathGoal = null; actor.nextPathAtMs = 0;
      }
    }
    if (buildId === this.buildId && this.worldId === (worldContext?.worldId || null)) return this.section;
    this.buildId = buildId;
    this.worldId = worldContext?.worldId || null;
    this.section = canonical?.data?.actors || null;
    this.loadSpawns(nowMs);
    return this.section;
  }

  groundYAt(x, z) {
    const index = this.worldContextRef?.walkabilityIndex || null;
    const fallback = Number(index?.ground?.y) || 0;
    try {
      // Wereld tekenen: loopvlak (brug) of anders de hoogte van het terrein.
      const y = index ? groundHeightAt(index, x, z, fallback, 0) : null;
      return Number.isFinite(y) ? y : fallback;
    } catch {
      return fallback;
    }
  }

  persistedStates() {
    if (!this.worldId) return new Map();
    try {
      return new Map(this.host.db.prepare("SELECT * FROM actor_spawn_state WHERE world_id = ?").all(this.worldId).map((row) => [row.spawn_key, row]));
    } catch {
      return new Map(); // migratie 015 nog niet gedraaid (bijv. oude testdatabase)
    }
  }

  loadSpawns(nowMs) {
    const section = this.section;
    const previousActors = this.actors;
    const previousResources = this.resources;
    this.actors = new Map();
    this.resources = new Map();
    if (!section || !this.worldId) return;
    const persisted = this.persistedStates();
    for (const spawn of section.spawns || []) {
      const def = section.archetypes?.[spawn.actorId];
      if (!def) continue;
      const spawnKey = ACTOR_INSTANCE_PREFIX + spawn.spawnId;
      const old = previousActors.get(spawnKey);
      const actor = old && old.def.actorId === def.actorId ? old : this.newActor(spawn, def, persisted.get(spawnKey), nowMs);
      actor.def = def;
      actor.spawn = spawn;
      actor.home = { x: meters(spawn.xMm), z: meters(spawn.zMm) };
      actor.hpMax = def.healthMax;
      actor.hp = Math.min(actor.hp, actor.hpMax);
      if (actor !== old) actor.y = this.groundYAt(actor.x, actor.z);
      actor.patrol = Array.isArray(spawn.patrolPointsMm) ? spawn.patrolPointsMm.map(([x, z]) => ({ x: meters(x), z: meters(z) })) : [];
      this.actors.set(spawnKey, actor);
    }
    for (const spawn of section.resourceSpawns || []) {
      const def = section.resources?.[spawn.resourceId];
      if (!def) continue;
      const spawnKey = RESOURCE_INSTANCE_PREFIX + spawn.resourceSpawnId;
      const old = previousResources.get(spawnKey);
      const resource = old && old.def.resourceId === def.resourceId ? old : this.newResource(spawn, def, persisted.get(spawnKey), nowMs);
      resource.def = def;
      resource.x = meters(spawn.xMm);
      resource.z = meters(spawn.zMm);
      resource.y = this.groundYAt(resource.x, resource.z);
      this.resources.set(spawnKey, resource);
    }
    // Stap 5: quest-vijanden blijven bij een nieuwe build; na een herstart komen ze uit de database.
    if (this.questGroupsWorld !== this.worldId) {
      this.questGroupsWorld = this.worldId;
      this.questGroups = new Map();
      this.loadQuestGroups();
    }
    this.restoreQuestActors(previousActors, nowMs);
  }

  newActor(spawn, def, row, nowMs) {
    const occurrence = Math.max(1, Number(row?.occurrence) || 1);
    const deadUntil = row && row.state === "dead" ? Number(row.respawn_at_ms) || 0 : 0;
    const actor = {
      kind: "actor", spawnKey: ACTOR_INSTANCE_PREFIX + spawn.spawnId, occurrence, def, spawn,
      x: meters(spawn.xMm), z: meters(spawn.zMm), y: 0, ry: 0,
      hp: def.healthMax, hpMax: def.healthMax, state: "idle", anim: "idle", animUntilMs: 0,
      targetPlayerId: null, path: [], pathGoal: null, pathFails: 0, patrolIndex: 0, pauseUntilMs: 0, stuck: 0,
      nextAttackAtMs: 0, contributors: new Set(), respawnAtMs: 0, rev: 1
    };
    if (deadUntil > nowMs) {
      actor.state = "dead";
      actor.anim = "dead";
      actor.hp = 0;
      actor.respawnAtMs = deadUntil;
    } else if (row && row.state === "dead") {
      actor.occurrence = occurrence + 1; // tijdens de herstart al teruggekomen
      this.persistState(actor.spawnKey, actor.occurrence, "alive", null);
    }
    actor.id = actor.spawnKey + ":" + actor.occurrence;
    return actor;
  }

  newResource(spawn, def, row, nowMs) {
    const occurrence = Math.max(1, Number(row?.occurrence) || 1);
    const until = row && row.state === "depleted" ? Number(row.respawn_at_ms) || 0 : 0;
    const resource = {
      kind: "resource", spawnKey: RESOURCE_INSTANCE_PREFIX + spawn.resourceSpawnId, occurrence, def, spawn,
      x: meters(spawn.xMm), z: meters(spawn.zMm), y: 0, available: true, respawnAtMs: 0, rev: 1
    };
    if (until > nowMs) {
      resource.available = false;
      resource.respawnAtMs = until;
    } else if (row && row.state === "depleted") {
      resource.occurrence = occurrence + 1;
      this.persistState(resource.spawnKey, resource.occurrence, "alive", null);
    }
    resource.id = resource.spawnKey + ":" + resource.occurrence;
    return resource;
  }

  persistState(spawnKey, occurrence, state, respawnAtMs) {
    if (!this.worldId) return;
    try {
      this.host.db.prepare(`
        INSERT INTO actor_spawn_state (world_id, spawn_key, occurrence, state, respawn_at_ms, build_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(world_id, spawn_key) DO UPDATE SET occurrence = excluded.occurrence, state = excluded.state,
          respawn_at_ms = excluded.respawn_at_ms, build_id = excluded.build_id, updated_at = excluded.updated_at
      `).run(this.worldId, spawnKey, occurrence, state, respawnAtMs, this.buildId, new Date().toISOString());
    } catch (error) {
      console.error("[actors] spawnstate niet opgeslagen:", error.message);
    }
  }

  navigatorFor(radiusMm) {
    const radiusClass = Math.max(250, Math.ceil(Number(radiusMm || 500) / 250) * 250);
    let nav = this.navigators.get(radiusClass);
    if (!nav) {
      const context = this.worldContextRef;
      nav = createNavigator({ index: context?.walkabilityIndex || null, solids: context?.solidColliders || [], radius: radiusClass / 1000 });
      this.navigators.set(radiusClass, nav);
    }
    return nav;
  }

  // ---- lookup ---------------------------------------------------------------------------------------------

  findByInstanceId(instanceId) {
    const id = String(instanceId || "");
    const cut = id.lastIndexOf(":");
    const spawnKey = cut > 0 ? id.slice(0, cut) : id;
    const occurrence = Number(id.slice(cut + 1));
    const entry = isActorInstanceId(id) ? this.actors.get(spawnKey) : isResourceInstanceId(id) ? this.resources.get(spawnKey) : null;
    if (!entry) return { entry: null, stale: false };
    return { entry, stale: entry.occurrence !== occurrence };
  }

  areaIsSafe(areaId) {
    if (!areaId) return false;
    try {
      const area = this.host.spatial()?.index?.areas?.get(areaId);
      return area?.safe === true;
    } catch {
      return false;
    }
  }

  pointIsSafe(x, z) {
    try {
      const index = this.host.spatial()?.index;
      if (!index) return false;
      const membership = resolveMembership(index, metersToMm(x), metersToMm(z), null);
      return this.areaIsSafe(membership.areaId);
    } catch {
      return false;
    }
  }

  // ---- tick ----------------------------------------------------------------------------------------------

  tick(worldId, nowMs, deltaMs) {
    const section = this.ensureBuild(nowMs);
    if (!section || worldId !== this.worldId) return;
    this.accumulatorMs = Math.min(AI_STEP_MS * 3, this.accumulatorMs + Math.max(0, Number(deltaMs) || 0));
    if (this.accumulatorMs >= AI_STEP_MS) {
      this.accumulatorMs -= AI_STEP_MS;
      const startedAt = performance.now();
      this.step(nowMs);
      const ms = performance.now() - startedAt;
      this.perf.steps += 1;
      this.perf.maxStepMs = Math.max(this.perf.maxStepMs, ms);
      this.perf.avgStepMs = this.perf.avgStepMs ? this.perf.avgStepMs * 0.95 + ms * 0.05 : ms;
    }
    if (nowMs - this.lastSnapshotAtMs >= SNAPSHOT_MS) {
      this.lastSnapshotAtMs = nowMs;
      this.sendSnapshots(nowMs);
    }
  }

  playersForStep() {
    const players = new Map();
    for (const state of this.host.playerStates(this.worldId)) {
      const id = state?.player_id;
      if (!id || !this.host.isOnline(id, this.worldId)) continue;
      const x = Number(state.x); const z = Number(state.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
      players.set(id, { id, x, z, safe: this.areaIsSafe(state.current_area_id), defeated: this.host.isDefeated(id) });
    }
    return players;
  }

  step(nowMs) {
    this.lastStepAtMs = nowMs;
    if (nowMs - this.regenAtMs >= REGEN_STEP_MS) {
      this.regenAtMs = nowMs;
      this.regenActors();
    }
    const players = this.playersForStep();
    const playerList = Array.from(players.values());
    const near = (x, z, range) => playerList.some((p) => Math.hypot(p.x - x, p.z - z) <= range);
    const budget = { left: PATH_QUERIES_PER_STEP, checks: PATH_CHECKS_PER_STEP };
    for (const resource of this.resources.values()) {
      if (!resource.available && nowMs >= resource.respawnAtMs) this.respawnResource(resource);
    }
    if (nowMs - this.questKeepAtMs >= QUEST_KEEP_MS) {
      this.questKeepAtMs = nowMs;
      this.keepQuestGroups(nowMs);
    }
    // Stap 8: de levende begeleide NPC's (meestal geen: dan kost het niets).
    const escorts = [];
    for (const actor of this.actors.values()) if (actor.escort && actor.state !== "dead") escorts.push(actor);
    for (const actor of this.actors.values()) {
      if (actor.state === "dead") {
        // Een quest-vijand komt niet terug: na even liggen is hij weg.
        if (nowMs >= actor.respawnAtMs) { if (actor.group) this.actors.delete(actor.spawnKey); else this.respawnActor(actor, nowMs); }
        continue;
      }
      if (actor.escort) { this.stepEscort(actor, nowMs, players, budget); continue; }
      if (actor.state !== "return" && actor.state !== "engage" && !near(actor.x, actor.z, WAKE_M) && !near(actor.home.x, actor.home.z, WAKE_M)) continue;
      this.stepActor(actor, nowMs, players, playerList, budget, escorts);
    }
    this.flushEscortNews();
  }

  // Healing (2-11): vijanden met Regeneratie aan krijgen elke seconde levens terug, ook tijdens het gevecht.
  regenActors() {
    const nowMs = this.lastStepAtMs;
    for (const resource of this.resources.values()) {
      if (!resource.takenBy?.size) continue;
      for (const [playerId, until] of resource.takenBy) if (until <= nowMs) resource.takenBy.delete(playerId);
    }
    for (const actor of this.actors.values()) {
      const def = actor.def;
      // Stap 8: een begeleide NPC die even niet geraakt is, krijgt langzaam levens terug.
      if (actor.escort) {
        if (actor.state === "dead" || actor.hp >= actor.hpMax || nowMs - (actor.hitAtMs || 0) < ESCORT_REGEN_AFTER_MS) continue;
        actor.hp = Math.min(actor.hpMax, actor.hp + Math.max(1, Math.round(actor.hpMax * ESCORT_REGEN_PART)));
        actor.rev += 1;
        continue;
      }
      if (actor.state === "dead" || !def.regenEnabled || !(def.regenBp > 0) || actor.hp >= actor.hpMax) { actor.regenCarry = 0; continue; }
      const step = regenStep(actor.hpMax, def.regenBp, actor.regenCarry || 0, 1);
      actor.regenCarry = step.carry;
      if (step.amount <= 0) continue;
      actor.hp = Math.min(actor.hpMax, actor.hp + step.amount);
      actor.rev += 1;
    }
  }

  // Healing (2-11): een vijand-healer geneest zichzelf of de zwakste vechtende vijand binnen het bereik van zijn spreuk.
  tryHeal(actor, nowMs) {
    const def = actor.def;
    if (!def.healAbilityId || nowMs < (actor.nextHealAtMs || 0)) return false;
    const ability = this.section?.abilities?.[def.healAbilityId];
    if (!ability || ability.abilityKind !== "heal") return false;
    const reach = meters(ability.rangeMm) + meters(def.radiusMm);
    let best = null;
    let bestPct = HEAL_BELOW;
    for (const other of this.actors.values()) {
      if (other.state === "dead" || other.hpMax <= 0) continue;
      if (other !== actor && (other.state !== "engage" || other.group !== actor.group)) continue;
      const pct = other.hp / other.hpMax;
      if (pct >= bestPct) continue;
      if (other !== actor && Math.hypot(other.x - actor.x, other.z - actor.z) > reach + meters(other.def.radiusMm)) continue;
      best = other;
      bestPct = pct;
    }
    if (!best) return false;
    const before = best.hp;
    best.hp = Math.min(best.hpMax, best.hp + computeHeal(ability, 0));
    best.rev += 1;
    actor.nextHealAtMs = nowMs + Math.max(100, ability.cooldownMs);
    actor.nextAttackAtMs = Math.max(actor.nextAttackAtMs, nowMs + ATTACK_ANIM_MS);
    if (best !== actor) actor.ry = Math.atan2(best.x - actor.x, best.z - actor.z);
    actor.path = [];
    actor.anim = "attack";
    actor.animUntilMs = nowMs + ATTACK_ANIM_MS;
    actor.rev += 1;
    this.emitEvent({ e: "heal", id: best.id, by: actor.id, amount: best.hp - before, hp: best.hp }, best.x, best.z, best);
    return true;
  }

  eligibleTarget(actor, player) {
    if (!player || player.defeated || player.safe) return false;
    // Stap 5: een quest-vijand jaagt alleen op wie hem mag zien.
    if (actor.group && !this.canSeeGroup(actor.group, player.id)) return false;
    return Math.hypot(player.x - actor.home.x, player.z - actor.home.z) <= meters(actor.def.leashRangeMm) + 2;
  }

  // Stap 8: mag deze vijand deze begeleide NPC aanvallen? Niet als hij al aangekomen of klaar is, niet in een veilig gebied;
  // een quest-vijand alleen als iemand van die begeleiding hem mag zien.
  eligibleEscort(actor, escort) {
    if (!escort || escort.state === "dead" || !escort.group?.escort) return false;
    const info = escort.group.escort;
    if (info.arrived || info.leaveAtMs || this.pointIsSafe(escort.x, escort.z)) return false;
    if (actor.group && !Array.from(escort.group.members).some((id) => this.canSeeGroup(actor.group, id))) return false;
    return Math.hypot(escort.x - actor.home.x, escort.z - actor.home.z) <= meters(actor.def.leashRangeMm) + 2;
  }

  // Het doelwit van een vijand: een speler, of (stap 8) een begeleide NPC.
  targetOf(actor, players) {
    if (!actor.targetEscort) return players.get(actor.targetPlayerId) || null;
    const escort = this.actors.get(actor.targetPlayerId);
    return escort && escort.escort ? { id: escort.id, x: escort.x, z: escort.z, escort } : null;
  }

  stepActor(actor, nowMs, players, playerList, budget, escorts = []) {
    const def = actor.def;
    if (actor.anim === "attack" && nowMs >= actor.animUntilMs) this.setAnim(actor, "idle");
    if (actor.state !== "return" && this.tryHeal(actor, nowMs)) return;
    if (actor.state === "idle" || actor.state === "patrol") {
      if (def.behavior === "aggressive" && def.aggroRangeMm > 0) {
        let best = null;
        let bestDistance = Infinity;
        let bestEscort = false;
        // Stap 8: een begeleide NPC binnen bereik gaat voor (jullie moeten hem beschermen).
        for (const escort of escorts) {
          if (!this.eligibleEscort(actor, escort)) continue;
          const distance = Math.hypot(escort.x - actor.x, escort.z - actor.z);
          if (distance <= meters(def.aggroRangeMm) && distance < bestDistance) { best = escort; bestDistance = distance; bestEscort = true; }
        }
        if (!best) {
          for (const player of playerList) {
            if (!this.eligibleTarget(actor, player)) continue;
            const distance = Math.hypot(player.x - actor.x, player.z - actor.z);
            if (distance <= meters(def.aggroRangeMm) && distance < bestDistance) { best = player; bestDistance = distance; }
          }
        }
        if (best) this.engage(actor, bestEscort ? best.spawnKey : best.id, bestEscort);
      }
      if (actor.state !== "engage") {
        if (actor.patrol.length >= 2) this.stepPatrol(actor, nowMs, budget);
        else if (Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) > HOME_REACHED_M) this.moveTowards(actor, actor.home, budget, false);
        else this.setAnim(actor, "idle");
        return;
      }
    }
    if (actor.state === "engage") {
      const target = this.targetOf(actor, players);
      const fromHome = Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z);
      const eligible = target?.escort ? this.eligibleEscort(actor, target.escort) : this.eligibleTarget(actor, target);
      if (!eligible || fromHome > meters(def.leashRangeMm)) { this.startReturn(actor); return; }
      const ability = this.section.abilities?.[def.abilityId];
      if (!ability) { this.startReturn(actor); return; }
      const reachMm = ability.rangeMm + def.radiusMm + PLAYER_RADIUS_MM;
      if (withinRangeMm(mm(actor.x), mm(actor.z), mm(target.x), mm(target.z), reachMm)) {
        actor.path = [];
        const facing = Math.atan2(target.x - actor.x, target.z - actor.z);
        if (Math.abs(facing - actor.ry) > 0.05) { actor.ry = facing; actor.rev += 1; }
        if (nowMs >= actor.nextAttackAtMs) { if (target.escort) this.attackEscort(actor, target.escort, ability, nowMs); else this.attackPlayer(actor, target, ability, nowMs); }
        else if (actor.anim !== "attack") this.setAnim(actor, "idle");
        return;
      }
      if (!this.moveTowards(actor, target, budget, true)) {
        actor.pathFails += 1;
        if (actor.pathFails >= PATH_FAILS_BEFORE_RETURN) this.startReturn(actor);
      }
      return;
    }
    if (actor.state === "return") {
      if (Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) <= HOME_REACHED_M) {
        actor.state = "idle";
        actor.hp = actor.hpMax; // terug thuis = weer heel (geen "aan de lijn trekken"-exploit)
        actor.contributors.clear();
        actor.path = [];
        this.setAnim(actor, "idle");
        return;
      }
      if (!this.moveTowards(actor, actor.home, budget, false)) {
        actor.pathFails += 1;
        if (actor.pathFails > 20) { // echt vast: zet terug op de plek zelf
          actor.x = actor.home.x; actor.z = actor.home.z; actor.path = []; actor.rev += 1;
        }
      }
    }
  }

  stepPatrol(actor, nowMs, budget) {
    actor.state = "patrol";
    if (nowMs < actor.pauseUntilMs) { this.setAnim(actor, "idle"); return; }
    const point = actor.patrol[actor.patrolIndex % actor.patrol.length];
    if (Math.hypot(actor.x - point.x, actor.z - point.z) <= HOME_REACHED_M) {
      actor.patrolIndex = (actor.patrolIndex + 1) % actor.patrol.length;
      actor.pauseUntilMs = nowMs + PATROL_PAUSE_MS;
      actor.path = [];
      this.setAnim(actor, "idle");
      return;
    }
    this.moveTowards(actor, point, budget, false);
  }

  // escort = true: het doelwit is een begeleide NPC (targetPlayerId is dan zijn spawnKey).
  engage(actor, playerId, escort = false) {
    actor.state = "engage";
    actor.targetPlayerId = playerId;
    actor.targetEscort = escort === true;
    actor.path = [];
    actor.pathGoal = null;
    actor.pathFails = 0;
    actor.nextPathAtMs = 0;
    actor.rev += 1;
  }

  startReturn(actor) {
    actor.state = "return";
    actor.targetPlayerId = null;
    actor.targetEscort = false;
    actor.path = [];
    actor.pathGoal = null;
    actor.pathFails = 0;
    actor.nextPathAtMs = 0;
    actor.rev += 1;
  }

  setAnim(actor, anim) {
    if (actor.anim === anim) return;
    actor.anim = anim;
    actor.rev += 1;
  }

  // Loopt een stap richting goal. Alleen een mislukte zoekopdracht telt als routefout.
  moveTowards(actor, goal, budget, chasing) {
    const now = this.lastStepAtMs;
    const needPath = !actor.path.length || !actor.pathGoal || Math.hypot(actor.pathGoal.x - goal.x, actor.pathGoal.z - goal.z) > (chasing ? REPATH_DISTANCE_M : 0.1);
    if (needPath && now >= (actor.nextPathAtMs || 0)) {
      if (budget.left > 0 && (budget.checks ?? PATH_CHECKS_PER_QUERY) > 0) {
        budget.left -= 1;
        this.perf.pathQueries += 1;
        const result = this.navigatorFor(actor.def.radiusMm).findPath({ x: actor.x, y: actor.y, z: actor.z }, { x: goal.x, z: goal.z }, {
          maxExpanded: PATH_MAX_EXPANDED, maxChecks: Math.min(PATH_CHECKS_PER_QUERY, budget.checks ?? PATH_CHECKS_PER_QUERY)
        });
        budget.checks = Math.max(0, (budget.checks ?? PATH_CHECKS_PER_QUERY) - result.checks);
        actor.nextPathAtMs = now + (result.ok ? REPATH_INTERVAL_MS : PATH_RETRY_MS);
        if (result.ok) {
          actor.path = result.points.slice();
          actor.pathGoal = { x: goal.x, z: goal.z };
        } else if (!actor.path.length) {
          this.setAnim(actor, "idle");
          return false;
        }
      } else {
        this.perf.pathBudgetHits += 1;
      }
    }
    // Wachten op zoekbudget is geen mislukte route; nooit blind naar het eindpunt lopen.
    if (!actor.path.length) {
      this.setAnim(actor, "idle");
      return true;
    }
    const moved = this.followPath(actor);
    if (moved) actor.pathFails = 0;
    else {
      actor.path = []; actor.pathGoal = null;
      actor.nextPathAtMs = Math.max(actor.nextPathAtMs || 0, now + REPATH_INTERVAL_MS);
    }
    return true;
  }

  followPath(actor) {
    const context = this.worldContextRef;
    let remaining = (Math.max(0, actor.def.moveSpeedMmPerS) / 1000) * (AI_STEP_MS / 1000);
    if (remaining <= 0) return false;
    const radius = meters(actor.def.radiusMm);
    let movedAny = false;
    let guard = 0;
    while (remaining > 1e-6 && actor.path.length && guard < 16) {
      guard += 1;
      const target = actor.path[0];
      const dx = target.x - actor.x; const dz = target.z - actor.z;
      const distance = Math.hypot(dx, dz);
      if (distance <= 0.001) { actor.path.shift(); continue; }
      const step = Math.min(distance, remaining);
      const desired = { x: actor.x + (dx / distance) * step, y: actor.y, z: actor.z + (dz / distance) * step };
      const result = resolveMovement({ x: actor.x, y: actor.y, z: actor.z }, desired, { radius, index: context?.walkabilityIndex || null, solids: context?.solidColliders || [] });
      const moved = Math.hypot(result.x - actor.x, result.z - actor.z);
      actor.ry = Math.atan2(result.x - actor.x, result.z - actor.z);
      actor.x = result.x; actor.y = Number.isFinite(result.y) ? result.y : actor.y; actor.z = result.z;
      remaining -= step;
      if (moved < step * 0.1) {
        actor.stuck += 1;
        if (actor.stuck >= 5) { actor.path = []; actor.stuck = 0; }
        break;
      }
      actor.stuck = 0;
      movedAny = true;
    }
    this.setAnim(actor, movedAny ? "walk" : actor.anim === "attack" ? "attack" : "idle");
    if (movedAny) actor.rev += 1;
    return movedAny || !actor.path.length;
  }

  attackPlayer(actor, target, ability, nowMs) {
    actor.nextAttackAtMs = nowMs + Math.max(100, ability.cooldownMs);
    actor.anim = "attack";
    actor.animUntilMs = nowMs + ATTACK_ANIM_MS;
    actor.rev += 1;
    let outcome = null;
    if (this.bridge && typeof this.bridge.applyActorHit === "function") {
      try {
        outcome = this.bridge.applyActorHit({ worldId: this.worldId, playerId: target.id, actorId: actor.id, label: actor.def.displayName, ability, attackPower: actor.def.attackPower });
      } catch (error) {
        console.error("[actors] aanval op speler mislukt:", error.message);
      }
    }
    this.emitEvent({ e: "attack", id: actor.id, target: target.id, amount: outcome?.damage ?? null, remainingHealth: outcome?.remainingHealth ?? null, defeated: outcome?.defeated === true }, actor.x, actor.z, actor);
    if (outcome?.defeated) this.startReturn(actor);
  }

  respawnActor(actor, nowMs) {
    actor.occurrence += 1;
    actor.id = actor.spawnKey + ":" + actor.occurrence;
    actor.state = "idle";
    actor.hp = actor.hpMax;
    actor.x = actor.home.x; actor.z = actor.home.z; actor.y = this.groundYAt(actor.x, actor.z);
    actor.path = []; actor.pathGoal = null; actor.targetPlayerId = null; actor.patrolIndex = 0; actor.pauseUntilMs = 0;
    actor.nextPathAtMs = 0;
    actor.contributors = new Set();
    actor.anim = "idle";
    actor.nextAttackAtMs = nowMs + 1000;
    actor.rev += 1;
    this.persistState(actor.spawnKey, actor.occurrence, "alive", null);
    this.emitEvent({ e: "respawn", id: actor.id }, actor.x, actor.z, actor);
  }

  respawnResource(resource) {
    resource.occurrence += 1;
    resource.id = resource.spawnKey + ":" + resource.occurrence;
    resource.available = true;
    resource.respawnAtMs = 0;
    resource.rev += 1;
    this.persistState(resource.spawnKey, resource.occurrence, "alive", null);
  }

  // ---- spelersacties (aangeroepen door node03 binnen runOperation) ------------------------------------------

  // ctx: { playerId, classId, x, z (m), safe, attackPower, nowMs, operationId }. Puur: verandert het geheugen niet.
  planPlayerAttack(ctx) {
    const section = this.ensureBuild(ctx.nowMs);
    const { entry: actor, stale } = this.findByInstanceId(ctx.targetId);
    if (!section || !actor || actor.kind !== "actor") throw httpError(404, "Vijand niet gevonden.");
    // Stap 8: een begeleide NPC is een vriend.
    if (actor.escort) throw httpError(409, "Dit is geen vijand.", "NOT_AN_ENEMY");
    // Stap 5: wie een quest-vijand niet mag zien, kan hem ook niet raken.
    if (actor.group && !this.canSeeGroup(actor.group, ctx.playerId)) throw httpError(404, "Vijand niet gevonden.");
    const label = actor.def.displayName;
    if (stale || actor.state === "dead") return { plan: null, result: { action: "attack", targetId: ctx.targetId, message: label + " is al verslagen.", events: [] } };
    if (ctx.safe || this.pointIsSafe(actor.x, actor.z)) throw httpError(409, "Hier kun je niet vechten (veilig gebied).", "SAFE_AREA");
    const ability = playerAbilityFromSection(section, ctx.classId || null);
    const reachMm = ability.rangeMm + actor.def.radiusMm + RANGE_SLACK_MM;
    if (!withinRangeMm(mm(ctx.x), mm(ctx.z), mm(actor.x), mm(actor.z), reachMm)) {
      const error = httpError(400, "Target is te ver weg voor attack.", "TARGET_OUT_OF_RANGE");
      error.details = { range: meters(ability.rangeMm), radius: meters(actor.def.radiusMm) };
      throw error;
    }
    const lastAt = this.playerAttackAtMs.get(ctx.playerId) || 0;
    const waitMs = lastAt + ability.cooldownMs - ctx.nowMs;
    if (waitMs > 0) return { plan: null, result: { action: "attack", targetId: actor.id, message: "Nog even wachten.", cooldownMs: waitMs, events: [] } };
    const damage = computeDamage(ability, ctx.attackPower, actor.def.armor);
    const hpAfter = Math.max(0, actor.hp - damage);
    const killed = hpAfter === 0;
    const rewards = [];
    if (killed) {
      const playerIds = Array.from(new Set(Array.from(actor.contributors).concat(ctx.playerId))).sort();
      for (const playerId of playerIds) {
        rewards.push({
          playerId,
          claimKey: actor.id + "|" + playerId,
          items: actor.def.lootTableId ? rollLoot(section.lootTables, actor.def.lootTableId, lootSeed(this.buildId, actor.id, playerId)) : [],
          xp: Math.max(0, Number(actor.def.xpReward) || 0)
        });
      }
    }
    const plan = {
      kind: "attack", instanceId: actor.id, actorId: actor.def.actorId, x: actor.x, z: actor.z, spawnKey: actor.spawnKey, occurrence: actor.occurrence, playerId: ctx.playerId,
      damage, hpAfter, killed, respawnAtMs: killed ? ctx.nowMs + (actor.group ? QUEST_CORPSE_MS : actor.def.respawnMs) : null, rewards, buildId: this.buildId, label,
      questSpawn: actor.group ? { groupId: actor.group.id, questId: actor.group.questId, spawnId: actor.group.spawnId } : null
    };
    this.pending.set(ctx.operationId, plan);
    return { plan, result: null };
  }

  planGather(ctx) {
    const section = this.ensureBuild(ctx.nowMs);
    const { entry: resource, stale } = this.findByInstanceId(ctx.targetId);
    if (!section || !resource || resource.kind !== "resource") throw httpError(404, "Grondstof niet gevonden.");
    const label = resource.def.displayName;
    if (stale || !resource.available) return { plan: null, result: { action: "gather", targetId: ctx.targetId, message: label + " is op. Kom later terug.", events: [] } };
    // Stap 5: Ieder zijn eigen: voor jou weg tot Terug na, anderen zien en oogsten hem nog.
    const personal = resource.def.gatherMode === "personal";
    if (personal && (resource.takenBy?.get(ctx.playerId) || 0) > ctx.nowMs) return { plan: null, result: { action: "gather", targetId: ctx.targetId, message: label + " heb je al geoogst. Kom later terug.", events: [] } };
    const reachMm = resource.def.gatherRangeMm + resource.def.radiusMm + RANGE_SLACK_MM;
    if (!withinRangeMm(mm(ctx.x), mm(ctx.z), mm(resource.x), mm(resource.z), reachMm)) {
      const error = httpError(400, "Target is te ver weg voor gather.", "TARGET_OUT_OF_RANGE");
      error.details = { range: meters(resource.def.gatherRangeMm), radius: meters(resource.def.radiusMm) };
      throw error;
    }
    const plan = {
      kind: "gather", instanceId: resource.id, resourceId: resource.def.resourceId, x: resource.x, z: resource.z, spawnKey: resource.spawnKey, occurrence: resource.occurrence, playerId: ctx.playerId,
      claimKey: personal ? resource.id + "|" + ctx.playerId + "|" + ctx.operationId : resource.id,
      items: rollLoot(section.lootTables, resource.def.lootTableId, lootSeed(this.buildId, personal ? resource.id + "|" + ctx.operationId : resource.id, ctx.playerId)),
      respawnAtMs: ctx.nowMs + resource.def.respawnMs, buildId: this.buildId, label, personal,
      eventKey: personal ? resource.id + ":" + ctx.operationId : resource.id
    };
    this.pending.set(ctx.operationId, plan);
    return { plan, result: null };
  }

  dropPending(operationId) {
    this.pending.delete(operationId);
  }

  // Na COMMIT: pas nu verandert de vijand/grondstof in het geheugen.
  applyPending(operationId, nowMs = Date.now()) {
    const plan = this.pending.get(operationId);
    this.pending.delete(operationId);
    if (!plan) return;
    if (plan.kind === "gather") {
      const resource = this.resources.get(plan.spawnKey);
      if (!resource || resource.occurrence !== plan.occurrence || plan.claimed === false) return;
      if (plan.personal) {
        if (!resource.takenBy) resource.takenBy = new Map();
        resource.takenBy.set(plan.playerId, plan.respawnAtMs);
        this.emitEvent({ e: "gathered", id: resource.id, by: plan.playerId }, resource.x, resource.z, resource, plan.playerId);
        return;
      }
      resource.available = false;
      resource.respawnAtMs = plan.respawnAtMs;
      resource.rev += 1;
      this.emitEvent({ e: "gathered", id: resource.id, by: plan.playerId }, resource.x, resource.z, resource);
      return;
    }
    const actor = this.actors.get(plan.spawnKey);
    if (!actor || actor.occurrence !== plan.occurrence) return;
    this.playerAttackAtMs.set(plan.playerId, nowMs);
    actor.hp = plan.hpAfter;
    actor.contributors.add(plan.playerId);
    actor.rev += 1;
    if (plan.killed) {
      actor.state = "dead";
      actor.anim = "dead";
      actor.respawnAtMs = plan.respawnAtMs;
      actor.path = [];
      actor.targetPlayerId = null;
      if (actor.group) {
        const spec = actor.group.actors.find((entry) => entry.key === actor.spawnKey);
        if (spec) spec.dead = true;
        this.persistQuestGroup(actor.group);
      }
      this.emitEvent({ e: "death", id: actor.id, by: plan.playerId, amount: plan.damage }, actor.x, actor.z, actor);
      return;
    }
    this.emitEvent({ e: "hit", id: actor.id, by: plan.playerId, amount: plan.damage, hp: actor.hp }, actor.x, actor.z, actor);
    // Stap 8: wie een vijand slaat die de begeleide NPC aanvalt, trekt hem naar zich toe (zo bescherm je hem).
    if (actor.state !== "return" && (actor.state !== "engage" || actor.targetEscort)) this.engage(actor, plan.playerId);
  }

  // ---- naar de clients ------------------------------------------------------------------------------------

  // Ieder zijn eigen: is deze grondstof voor deze speler nu op?
  takenFor(entry, playerId, nowMs = this.lastStepAtMs) {
    return Boolean(entry.takenBy && playerId && (entry.takenBy.get(playerId) || 0) > nowMs);
  }

  encode(entry, viewerId = null, nowMs = this.lastStepAtMs) {
    if (entry.kind === "resource") {
      return { id: entry.id, k: "r", d: entry.def.resourceId, x: r2(entry.x), y: r2(entry.y), z: r2(entry.z), s: entry.available && !this.takenFor(entry, viewerId, nowMs) ? "i" : "d" };
    }
    const s = entry.state === "dead" ? "d" : entry.anim === "attack" ? "a" : entry.anim === "walk" ? "w" : "i";
    // Stap 8: een begeleide NPC (d = NPC-ID; de game toont zijn eigen model en verbergt hem op zijn vaste plek).
    if (entry.escort) return { id: entry.id, k: "e", d: entry.npcId, x: r2(entry.x), y: r2(entry.y), z: r2(entry.z), r: Math.round(entry.ry * 100) / 100, hp: entry.hp, hm: entry.hpMax, s };
    return { id: entry.id, k: "a", d: entry.def.actorId, x: r2(entry.x), y: r2(entry.y), z: r2(entry.z), r: Math.round(entry.ry * 100) / 100, hp: entry.hp, hm: entry.hpMax, s };
  }

  sendSnapshots(nowMs) {
    const connections = this.host.connections(this.worldId);
    if (!connections.length) return;
    const positions = new Map();
    for (const state of this.host.playerStates(this.worldId)) {
      if (state?.player_id) positions.set(state.player_id, state);
    }
    const all = Array.from(this.actors.values()).concat(Array.from(this.resources.values()));
    const liveIds = new Set();
    for (const connection of connections) {
      liveIds.add(connection.id);
      const position = positions.get(connection.player?.id);
      if (!position) continue;
      let sent = this.sentByConnection.get(connection.id);
      if (!sent) { sent = { sigs: new Map(), lastFullAtMs: 0 }; this.sentByConnection.set(connection.id, sent); }
      const full = nowMs - sent.lastFullAtMs >= FULL_SNAPSHOT_MS;
      const px = Number(position.x); const pz = Number(position.z);
      const viewerId = connection.player?.id || null;
      const actors = [];
      const nearIds = new Set();
      for (const entry of all) {
        if (Math.abs(entry.x - px) > AOI_M || Math.abs(entry.z - pz) > AOI_M) continue;
        // Stap 5: een quest-vijand gaat alleen naar wie hem mag zien.
        if (entry.group && !this.canSeeGroup(entry.group, viewerId)) continue;
        nearIds.add(entry.id);
        const sig = entry.rev + ":" + entry.id + (entry.takenBy && this.takenFor(entry, viewerId, nowMs) ? ":t" : "");
        if (!full && sent.sigs.get(entry.id) === sig) continue;
        sent.sigs.set(entry.id, sig);
        actors.push(this.encode(entry, viewerId, nowMs));
      }
      const gone = [];
      for (const id of Array.from(sent.sigs.keys())) {
        if (!nearIds.has(id)) { sent.sigs.delete(id); gone.push(id); }
      }
      if (full) sent.lastFullAtMs = nowMs;
      if (!full && !actors.length && !gone.length) continue;
      this.host.send(connection, { type: "actor:snapshot", buildId: this.buildId, serverTimeMs: nowMs, full, actors, gone });
      this.perf.snapshotsSent += 1;
    }
    for (const id of Array.from(this.sentByConnection.keys())) {
      if (!liveIds.has(id)) this.sentByConnection.delete(id);
    }
  }

  // entry: de vijand/grondstof (quest-vijand: alleen naar wie hem mag zien). only: alleen naar deze speler.
  emitEvent(event, x, z, entry = null, only = null) {
    if (!this.worldId) return;
    const connections = this.host.connections(this.worldId);
    if (!connections.length) return;
    const positions = new Map();
    for (const state of this.host.playerStates(this.worldId)) if (state?.player_id) positions.set(state.player_id, state);
    const payload = Object.assign({ type: "actor:event", serverTimeMs: Date.now() }, event);
    for (const connection of connections) {
      if (only && connection.player?.id !== only) continue;
      if (entry?.group && !this.canSeeGroup(entry.group, connection.player?.id)) continue;
      const position = positions.get(connection.player?.id);
      const isTarget = event.target && connection.player?.id === event.target;
      if (!isTarget && (!position || Math.abs(Number(position.x) - x) > AOI_M || Math.abs(Number(position.z) - z) > AOI_M)) continue;
      this.host.send(connection, payload);
    }
  }

  // Quest Builder (Kevin 5-11): waar levende vijanden (of beschikbare grondstoffen) van deze soort nu zijn, voor de ⭐ op de kaart.
  // viewerId: alleen wat die speler mag zien (quest-vijanden, Ieder zijn eigen).
  livePositions(kind, defId, viewerId = null) {
    const list = [];
    const resource = kind === "resource";
    for (const entry of (resource ? this.resources : this.actors).values()) {
      if ((resource ? entry.def?.resourceId : entry.def?.actorId) !== defId) continue;
      if (resource ? !entry.available || this.takenFor(entry, viewerId) : entry.state === "dead") continue;
      if (entry.group && !this.canSeeGroup(entry.group, viewerId)) continue;
      list.push({ id: entry.id, x: entry.x, z: entry.z });
    }
    return list;
  }

  // Stap 5: waar de levende vijanden van deze verschijning zijn die deze speler ziet (voor de ⭐ op de kaart).
  questSpawnPositions(questId, spawnId, viewerId) {
    const list = [];
    for (const group of this.questGroups.values()) {
      if (group.questId !== questId || group.spawnId !== spawnId || !this.canSeeGroup(group, viewerId)) continue;
      for (const spec of group.actors) {
        const actor = spec.dead ? null : this.actors.get(spec.key);
        if (actor && actor.state !== "dead") list.push({ id: actor.id, x: actor.x, z: actor.z });
      }
    }
    return list;
  }

  // ---- Stap 5: quest-vijanden (Als → Dan: Laat verschijnen) ---------------------------------------------------

  partyOf(playerId) {
    try { return typeof this.host.partyOf === "function" ? this.host.partyOf(playerId) || null : null; } catch { return null; }
  }

  // De ene servercheck: mag deze speler deze groep zien (en dus raken, en wordt hij erdoor aangevallen)?
  // Iedereen: ja. Wie hem liet verschijnen of er zelf aan meedoet (members): ja, ook na groep verlaten (niets wordt gekopieerd).
  // Voor de groep: ook wie nu in die groep zit.
  canSeeGroup(group, playerId) {
    if (!group || !playerId) return false;
    if (group.audience === "all") return true;
    if (group.members.has(playerId)) return true;
    return group.ownerKind === "party" && Boolean(group.ownerId) && this.partyOf(playerId) === group.ownerId;
  }

  canSeeGroupId(groupId, playerId) {
    const group = this.questGroups.get(groupId);
    return group ? this.canSeeGroup(group, playerId) : false;
  }

  // Een groep van deze verschijning die deze speler al ziet (dan komt er geen tweede).
  findQuestGroup(questId, spawnId, playerId) {
    for (const group of this.questGroups.values()) {
      if (group.questId === questId && group.spawnId === spawnId && !group.escort?.dead && this.canSeeGroup(group, playerId)) return group;
    }
    return null;
  }

  // { worldId, questId, spawnId, stepId, ruleId, audience, despawn, playerId, actorId, count, center: { x, z }, around: meters }
  // Ziet de speler al een groep van deze verschijning, dan doet hij daaraan mee (geen dubbele groep). -> { group, created } | null
  spawnQuestGroup(request, nowMs = Date.now()) {
    if (!this.section || request.worldId !== this.worldId) this.ensureBuild(nowMs);
    if (!this.section || !this.worldId || (request.worldId && request.worldId !== this.worldId)) return null;
    const def = this.section.archetypes?.[request.actorId];
    if (!def || !request.playerId) return null;
    const existing = this.findQuestGroup(request.questId, request.spawnId, request.playerId);
    if (existing) {
      // Meedoen (gebeurt 1× per keer dat iemand de stap binnenkomt): altijd opslaan, zo staat hij zeker in de database.
      existing.members.add(request.playerId);
      existing.seen.set(request.playerId, nowMs);
      this.persistQuestGroup(existing);
      return { group: existing, created: false };
    }
    const audience = request.audience === "player" || request.audience === "all" ? request.audience : "group";
    const partyId = audience === "group" ? this.partyOf(request.playerId) : null;
    this.questSeq += 1;
    const id = "g" + nowMs.toString(36) + this.questSeq.toString(36);
    const group = {
      id, questId: request.questId, spawnId: request.spawnId, stepId: request.stepId || null, ruleId: request.ruleId || null, audience,
      ownerKind: audience === "all" ? null : partyId ? "party" : "player", ownerId: audience === "all" ? null : partyId || request.playerId,
      despawn: request.despawn === "step" || request.despawn === "logout" ? request.despawn : "quest",
      members: new Set([request.playerId]), seen: new Map([[request.playerId, nowMs]]), loadedAtMs: nowMs, createdAt: new Date(nowMs).toISOString(), actors: []
    };
    const count = Math.max(1, Math.min(10, Math.floor(Number(request.count) || 1)));
    const center = { x: Number(request.center?.x) || 0, z: Number(request.center?.z) || 0 };
    const ring = Math.max(1.5, Number(request.around) || 1.5 + count * 0.6);
    const turn = (nowMs % 360) * (Math.PI / 180);
    for (let index = 0; index < count; index += 1) {
      const angle = turn + (index / count) * Math.PI * 2;
      const point = this.walkablePoint(center, { x: center.x + Math.sin(angle) * ring, z: center.z + Math.cos(angle) * ring }, def.radiusMm);
      group.actors.push({ key: ACTOR_INSTANCE_PREFIX + QUEST_PREFIX + id + "." + index, actorId: def.actorId, x: r2(point.x), z: r2(point.z), dead: false });
    }
    this.questGroups.set(id, group);
    this.restoreQuestActors(new Map(), nowMs, group);
    this.persistQuestGroup(group);
    return { group, created: true };
  }

  // Van het midden naar de plek lopen met dezelfde botsing als spelers: zo staat een vijand nooit in een muur.
  walkablePoint(from, to, radiusMm) {
    const context = this.worldContextRef;
    try {
      const y = this.groundYAt(from.x, from.z);
      const result = resolveMovement({ x: from.x, y, z: from.z }, { x: to.x, y, z: to.z }, { radius: meters(radiusMm || 500), index: context?.walkabilityIndex || null, solids: context?.solidColliders || [] });
      if (Number.isFinite(result?.x) && Number.isFinite(result?.z)) return { x: result.x, z: result.z };
    } catch {}
    return { x: to.x, z: to.z };
  }

  newQuestActor(group, spec, def, nowMs) {
    const actor = {
      kind: "actor", spawnKey: spec.key, occurrence: 1, def, spawn: { spawnId: spec.key.slice(ACTOR_INSTANCE_PREFIX.length), actorId: def.actorId, xMm: mm(spec.x), zMm: mm(spec.z) },
      x: spec.x, z: spec.z, y: this.groundYAt(spec.x, spec.z), ry: 0, home: { x: spec.x, z: spec.z }, patrol: [], group,
      hp: def.healthMax, hpMax: def.healthMax, state: "idle", anim: "idle", animUntilMs: 0,
      targetPlayerId: null, path: [], pathGoal: null, pathFails: 0, patrolIndex: 0, pauseUntilMs: 0, stuck: 0,
      nextAttackAtMs: nowMs + 1000, contributors: new Set(), respawnAtMs: 0, rev: 1
    };
    actor.id = actor.spawnKey + ":1";
    return actor;
  }

  // De levende vijanden van de quest-groepen in de actors-lijst (na een nieuwe build: zelfde vijand, nieuwe gegevens).
  restoreQuestActors(previousActors, nowMs, only = null) {
    if (!this.section) return;
    for (const group of only ? [only] : this.questGroups.values()) {
      for (const spec of group.actors) {
        if (spec.dead) continue;
        if (spec.escort) {
          const old = previousActors.get(spec.key);
          const actor = old && old.escort ? old : this.newEscortActor(group, spec, nowMs);
          actor.group = group;
          actor.def = this.escortDef(group.escort?.walk);
          this.actors.set(spec.key, actor);
          continue;
        }
        const def = this.section.archetypes?.[spec.actorId];
        if (!def) continue;
        const old = previousActors.get(spec.key);
        const actor = old && old.def.actorId === def.actorId ? old : this.newQuestActor(group, spec, def, nowMs);
        actor.def = def;
        actor.group = group;
        actor.hpMax = def.healthMax;
        actor.hp = Math.min(actor.hp, actor.hpMax);
        this.actors.set(spec.key, actor);
      }
    }
  }

  removeQuestGroup(group, reason) {
    for (const spec of group.actors) this.actors.delete(spec.key);
    this.questGroups.delete(group.id);
    if (this.worldId) {
      try { this.host.db.prepare("DELETE FROM quest_spawn_groups WHERE world_id = ? AND group_id = ?").run(this.worldId, group.id); } catch {}
    }
    if (reason === "logout" && typeof this.questReleased === "function") {
      try { this.questReleased(group); } catch (error) { console.error("[actors] quest-regels vrijgeven mislukt:", error.message); }
    }
  }

  // Elke 2 s: wie heeft deze groep nog nodig? Niemand meer (quest of stap klaar, verlaten, of na uitloggen) = weg.
  keepQuestGroups(nowMs) {
    if (!this.questGroups.size || typeof this.questKeeper !== "function") return;
    for (const group of Array.from(this.questGroups.values())) {
      let result = null;
      try { result = this.questKeeper(group); } catch (error) { console.error("[actors] quest-groep controleren mislukt:", error.message); continue; }
      if (!result) continue;
      // Stap 8: een gevallen begeleide NPC blijft even liggen en is dan weg (de nieuwe staat al klaar bij het begin).
      if (group.escort?.dead) { if (nowMs >= (group.escort.deadUntil || 0)) this.removeQuestGroup(group, "dead"); continue; }
      const open = new Set(result.open || []);
      const need = (result.need || []).filter((id) => group.members.has(id));
      // Stap 8: klaar met begeleiden: hij blijft nog even staan (zichtbaar voor wie erbij was) en is dan weg.
      if (group.escort && !need.length) {
        if (!group.escort.leaveAtMs) { group.escort.leaveAtMs = nowMs + ESCORT_LEAVE_MS; const actor = this.escortActor(group); if (actor) { actor.path = []; this.setAnim(actor, "idle"); } }
        if (nowMs >= group.escort.leaveAtMs) this.removeQuestGroup(group, "done");
        continue;
      }
      let changed = false;
      for (const id of Array.from(group.members)) {
        if (!open.has(id)) { group.members.delete(id); group.seen.delete(id); changed = true; }
      }
      let keep = need.length > 0;
      let reason = "done";
      if (keep && (group.despawn === "logout" || group.escort)) {
        keep = need.some((id) => {
          if (this.host.isOnline(id, this.worldId)) { group.seen.set(id, nowMs); return true; }
          return nowMs - (group.seen.get(id) || group.loadedAtMs) < QUEST_LOGOUT_GRACE_MS;
        });
        if (!keep) reason = "logout";
      }
      if (!keep) this.removeQuestGroup(group, reason);
      else if (changed) this.persistQuestGroup(group);
    }
  }

  persistQuestGroup(group) {
    if (!this.worldId) return;
    if (group.escort) this.syncEscortSpec(group);
    try {
      const stamp = new Date().toISOString();
      this.host.db.prepare(`
        INSERT INTO quest_spawn_groups (world_id, group_id, quest_id, spawn_id, step_id, rule_id, audience, owner_kind, owner_id, despawn, members_json, actors_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(world_id, group_id) DO UPDATE SET members_json = excluded.members_json, actors_json = excluded.actors_json, updated_at = excluded.updated_at
      `).run(this.worldId, group.id, group.questId, group.spawnId, group.stepId, group.ruleId, group.audience, group.ownerKind, group.ownerId, group.despawn,
        JSON.stringify(Array.from(group.members)), JSON.stringify(group.actors), group.createdAt, stamp);
    } catch (error) {
      if (!this.questPersistWarned) { this.questPersistWarned = true; console.error("[actors] quest-groep niet opgeslagen:", error.message); }
    }
  }

  loadQuestGroups() {
    let rows = [];
    try { rows = this.host.db.prepare("SELECT * FROM quest_spawn_groups WHERE world_id = ?").all(this.worldId); } catch { return; } // migratie 025 nog niet gedraaid
    const nowMs = Date.now();
    for (const row of rows) {
      let members = [];
      let actors = [];
      try { members = JSON.parse(row.members_json || "[]"); actors = JSON.parse(row.actors_json || "[]"); } catch { continue; }
      this.questGroups.set(row.group_id, {
        id: row.group_id, questId: row.quest_id, spawnId: row.spawn_id, stepId: row.step_id || null, ruleId: row.rule_id || null, audience: row.audience,
        ownerKind: row.owner_kind || null, ownerId: row.owner_id || null, despawn: row.despawn, members: new Set(members), seen: new Map(), loadedAtMs: nowMs,
        createdAt: row.created_at, actors: (Array.isArray(actors) ? actors : []).filter((spec) => spec && typeof spec.key === "string")
      });
      // Stap 8: een begeleide NPC bewaart zijn instellingen bij zichzelf.
      const group = this.questGroups.get(row.group_id);
      const escortSpec = group.actors.find((spec) => spec.escort && typeof spec.escort === "object");
      if (escortSpec) group.escort = escortSpec.escort;
    }
  }

  // ---- Stap 8: begeleiden ---------------------------------------------------------------------------------------

  // Snelheid: volgen = zo snel als een speler loopt; zelf de weg lopen = rustig (je kunt hem bijhouden).
  escortDef(walk) {
    const speed = walk === "lead" ? this.playerSpeed() * 0.6 : this.playerSpeed();
    return { actorId: null, displayName: "", radiusMm: ESCORT_RADIUS_MM, moveSpeedMmPerS: Math.round(speed * 1000), armor: 0, regenEnabled: false, healthMax: 1 };
  }

  // Hoe snel spelers lopen (m/s) en hoeveel sneller met sprinten (instellingen van de wereld).
  playerSpeed(sprint = false) {
    const player = this.worldContextRef?.world?.player || {};
    const speed = Math.max(1, Number(player.moveSpeed) || 6);
    return sprint ? speed * Math.min(2.5, Math.max(1, Number(player.sprintMultiplier) || 1.6)) : speed;
  }

  escortActor(group) {
    const spec = group?.actors?.find((entry) => entry.escort);
    const actor = spec ? this.actors.get(spec.key) : null;
    return actor && actor.escort ? actor : null;
  }

  newEscortActor(group, spec, nowMs) {
    const x = Number(spec.x) || 0;
    const z = Number(spec.z) || 0;
    const hpMax = Math.max(1, Math.floor(Number(spec.hpMax) || Number(group.escort?.health) || 100));
    const actor = {
      kind: "actor", escort: true, npcId: spec.npcId, spawnKey: spec.key, occurrence: 1, def: this.escortDef(group.escort?.walk),
      spawn: { spawnId: spec.key.slice(ACTOR_INSTANCE_PREFIX.length), actorId: null, xMm: mm(x), zMm: mm(z) },
      x, z, y: this.groundYAt(x, z), ry: 0, home: { x, z }, patrol: [], group,
      hp: Math.max(1, Math.min(hpMax, Math.floor(Number(spec.hp) || hpMax))), hpMax, state: "follow", anim: "idle", animUntilMs: 0,
      targetPlayerId: null, path: [], pathGoal: null, pathFails: 0, patrolIndex: 0, pauseUntilMs: 0, stuck: 0,
      nextAttackAtMs: 0, contributors: new Set(), respawnAtMs: 0, rev: 1, hitAtMs: 0, persistAtMs: nowMs, progressAtMs: nowMs
    };
    actor.id = actor.spawnKey + ":1";
    return actor;
  }

  // Zijn plek en levens in de groep (voor de database en na een nieuwe build).
  syncEscortSpec(group) {
    const spec = group.actors.find((entry) => entry.escort);
    const actor = this.escortActor(group);
    if (!spec || !actor) return;
    spec.x = r2(actor.x); spec.z = r2(actor.z); spec.hp = actor.hp; spec.hpMax = actor.hpMax;
    spec.escort = group.escort;
  }

  // request: { worldId, questId, stepId, objectiveId, playerId, npcId, npcName, health, walk, say, death, deathTo, target: { x, z, points }, home: { x, z } }
  // Eén begeleide NPC per quest en NPC voor wie hem ziet (de groep deelt hem). Komt dezelfde NPC terug in de volgende stap,
  // dan loopt hij gewoon verder (zelfde plek en levens). Vaak aangeroepen: zonder wijziging doet het niets. -> { group, created } | null
  spawnEscort(request, nowMs = Date.now()) {
    if (!this.section || request.worldId !== this.worldId) this.ensureBuild(nowMs);
    if (!this.section || !this.worldId || (request.worldId && request.worldId !== this.worldId)) return null;
    const points = (Array.isArray(request.target?.points) ? request.target.points : []).filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z)));
    if (!request.playerId || !request.npcId || points.length < 3) return null;
    const spawnId = "escort." + request.npcId;
    const config = {
      npcId: request.npcId, npcName: String(request.npcName || request.npcId).slice(0, 80), stepId: request.stepId || null, objectiveId: request.objectiveId || null,
      walk: request.walk === "lead" ? "lead" : "follow", health: Math.max(1, Math.floor(Number(request.health) || 100)),
      death: request.death === "fail" || request.death === "step" ? request.death : "restart", deathTo: request.deathTo || null,
      target: { x: r2(Number(request.target.x) || 0), z: r2(Number(request.target.z) || 0), points: points.map((point) => ({ x: r2(point.x), z: r2(point.z) })) },
      say: String(request.say || "").slice(0, 200),
      fight: request.fight === true, power: Math.max(1, Math.floor(Number(request.power) || 5))
    };
    // Doorgaan met dezelfde NPC kan alleen als hij nog niet weggaat; al aangekomen alleen naar een volgende stap
    // (een nieuwe poging van dezelfde stap krijgt een nieuwe NPC op zijn eigen plek).
    let existing = null;
    for (const group of this.questGroups.values()) {
      if (group.questId !== request.questId || group.spawnId !== spawnId || !group.escort || group.escort.dead || group.escort.leaveAtMs) continue;
      if (group.escort.arrived && group.escort.stepId === config.stepId) continue;
      if (this.canSeeGroup(group, request.playerId)) { existing = group; break; }
    }
    if (existing) {
      let changed = false;
      if (!existing.members.has(request.playerId)) { existing.members.add(request.playerId); changed = true; }
      existing.seen.set(request.playerId, nowMs);
      const actor = this.escortActor(existing);
      if (existing.escort.stepId !== config.stepId || existing.escort.objectiveId !== config.objectiveId) {
        // Volgende stap met dezelfde NPC: hij loopt vanaf hier verder, naar het nieuwe gebied.
        const legStart = actor ? { x: r2(actor.x), z: r2(actor.z) } : existing.escort.legStart;
        existing.escort = Object.assign(config, { legStart, arrived: false, dead: false, leaveAtMs: 0 });
        existing.stepId = config.stepId;
        if (actor) {
          actor.def = this.escortDef(config.walk);
          actor.hpMax = config.health; actor.hp = Math.min(actor.hp, actor.hpMax);
          actor.path = []; actor.pathFails = 0; actor.state = "follow"; actor.rev += 1;
          if (config.say) this.escortSay(actor, existing, config.say);
        }
        changed = true;
      }
      if (changed) this.persistQuestGroup(existing);
      return { group: existing, created: false };
    }
    // Opnieuw na een val: bij het begin van dit stuk (waar de vorige begon), anders op zijn vaste plek (of bij de speler).
    let start = null;
    for (const group of this.questGroups.values()) {
      if (group.questId === request.questId && group.spawnId === spawnId && group.escort?.dead && group.escort.stepId === config.stepId && this.canSeeGroup(group, request.playerId)) start = group.escort.legStart || null;
    }
    if (!start && Number.isFinite(Number(request.home?.x)) && Number.isFinite(Number(request.home?.z))) {
      // Naast zijn vaste plek (niet erin: daar botst hij op zichzelf en vindt hij geen weg), een stap richting het doel.
      const home = { x: Number(request.home.x), z: Number(request.home.z) };
      const dx = config.target.x - home.x; const dz = config.target.z - home.z;
      const length = Math.hypot(dx, dz) || 1;
      start = this.walkablePoint({ x: home.x + (dx / length) * 0.05, z: home.z + (dz / length) * 0.05 }, { x: home.x + (dx / length) * 1.3, z: home.z + (dz / length) * 1.3 }, ESCORT_RADIUS_MM);
    }
    if (!start) {
      const me = this.playersForStep().get(request.playerId) || Array.from(this.host.playerStates(this.worldId) || []).find((state) => state?.player_id === request.playerId);
      if (!me || !Number.isFinite(Number(me.x))) return null;
      start = { x: Number(me.x), z: Number(me.z) };
    }
    const partyId = this.partyOf(request.playerId);
    this.questSeq += 1;
    const id = "e" + nowMs.toString(36) + this.questSeq.toString(36);
    config.legStart = { x: r2(start.x), z: r2(start.z) };
    config.arrived = false; config.dead = false; config.leaveAtMs = 0;
    const group = {
      id, questId: request.questId, spawnId, stepId: config.stepId, ruleId: null, audience: "group",
      ownerKind: partyId ? "party" : "player", ownerId: partyId || request.playerId, despawn: "logout",
      members: new Set([request.playerId]), seen: new Map([[request.playerId, nowMs]]), loadedAtMs: nowMs, createdAt: new Date(nowMs).toISOString(),
      escort: config,
      actors: [{ key: ACTOR_INSTANCE_PREFIX + QUEST_PREFIX + id + ".npc", npcId: request.npcId, x: r2(start.x), z: r2(start.z), hp: config.health, hpMax: config.health, dead: false, escort: config }]
    };
    this.questGroups.set(id, group);
    const actor = this.newEscortActor(group, group.actors[0], nowMs);
    this.actors.set(actor.spawnKey, actor);
    this.persistQuestGroup(group);
    if (config.say) this.escortSay(actor, group, config.say);
    return { group, created: true };
  }

  // Wat hij zegt: een ballon boven zijn hoofd (en een regel in de chat) voor wie hem ziet.
  escortSay(actor, group, text) {
    this.emitEvent({ e: "say", id: actor.id, name: group.escort?.npcName || "", text: String(text).slice(0, 200), questId: group.questId }, actor.x, actor.z, actor);
  }

  // Wie de quest op deze stap heeft, online is en niet verslagen: die volgt hij, en op die wacht hij.
  // Een groepsgenoot zonder de quest telt niet mee (Kevin 7-11).
  escortTeam(group, players) {
    const team = [];
    for (const id of group.members) {
      const player = players.get(id);
      if (player && !player.defeated) team.push(player);
    }
    return team;
  }

  // Naast een speler zetten (achter hem, op een plek waar je kunt staan).
  escortJump(actor, player) {
    const point = this.walkablePoint({ x: player.x, z: player.z }, { x: player.x - 1.5, z: player.z - 1.5 }, ESCORT_RADIUS_MM);
    actor.x = point.x; actor.z = point.z; actor.y = this.groundYAt(point.x, point.z);
    actor.path = []; actor.pathGoal = null; actor.pathFails = 0; actor.stuck = 0;
    actor.ry = Math.atan2(player.x - actor.x, player.z - actor.z);
    this.setAnim(actor, "idle");
    actor.rev += 1;
  }

  stepEscort(actor, nowMs, players, budget) {
    const group = actor.group;
    const info = group?.escort;
    if (!info || info.dead) return;
    if (actor.anim === "attack" && nowMs >= actor.animUntilMs) this.setAnim(actor, "idle");
    if (info.leaveAtMs || info.arrived) { if (actor.anim !== "idle") this.setAnim(actor, "idle"); return; }
    // Aangekomen: het hele gebied telt (niet alleen het midden).
    if (pointInArea(info.target.points, actor.x, actor.z)) {
      info.arrived = true;
      actor.path = [];
      this.setAnim(actor, "idle");
      this.persistQuestGroup(group);
      this.escortNews.push({ kind: "arrived", group });
      return;
    }
    let near = null;
    let nearDistance = Infinity;
    for (const player of this.escortTeam(group, players)) {
      const distance = Math.hypot(player.x - actor.x, player.z - actor.z);
      if (distance < nearDistance) { near = player; nearDistance = distance; }
    }
    // Niemand (uitgelogd of verslagen): hij wacht waar hij is.
    if (!near) { actor.state = "wait"; actor.path = []; actor.progressAtMs = nowMs; this.setAnim(actor, "idle"); return; }
    // Stap 8: vecht mee met vijanden bij hem of bij jullie.
    if (info.fight && nearDistance <= ESCORT_LOST_M && this.escortFight(actor, info, nowMs, budget, players)) { actor.progressAtMs = nowMs; return; }
    // Volgen en je bent ver weg: hij komt naast je staan. (Zelf de weg lopen: hij wacht op je.)
    if (info.walk !== "lead" && nearDistance > ESCORT_LOST_M) { this.escortJump(actor, near); actor.progressAtMs = nowMs; return; }
    let goal = near;
    if (info.walk === "lead") {
      if (nearDistance > ESCORT_WAIT_M) {
        // Hij wacht op je; zijn route bewaart hij.
        actor.state = "wait"; actor.progressAtMs = nowMs;
        const facing = Math.atan2(near.x - actor.x, near.z - actor.z);
        if (Math.abs(facing - actor.ry) > 0.3) { actor.ry = facing; actor.rev += 1; }
        this.setAnim(actor, "idle");
        return;
      }
      actor.state = "lead";
      // Zelf de weg: over de route (om bomen en water heen, over bruggen), zoals de klik-route van spelers.
      if (this.escortLeadRoute(actor, info, nowMs)) goal = null;
    } else actor.state = "follow";
    if (goal) {
      // Volgen (of: zelf de weg, maar er is geen route): achter de dichtstbijzijnde van jullie aan.
      if (nearDistance <= ESCORT_FOLLOW_M) { actor.path = []; actor.pathGoal = null; actor.progressAtMs = nowMs; this.setAnim(actor, "idle"); return; }
      // Ver achter: hij rent zo snel als jij sprint (iets sneller, zodat hij je inhaalt).
      const speed = nearDistance > ESCORT_RUN_M ? this.playerSpeed(true) * 1.05 : this.playerSpeed();
      actor.def.moveSpeedMmPerS = Math.round(speed * 1000);
      if (this.escortMove(actor, goal, budget, true, nowMs)) actor.progressAtMs = nowMs;
    } else {
      actor.def.moveSpeedMmPerS = Math.round(this.playerSpeed() * 0.6 * 1000);
      if (this.followPath(actor)) actor.progressAtMs = nowMs;
    }
    // Echt vast (geen stap vooruit): dan komt hij naast je staan.
    if (nowMs - (actor.progressAtMs || nowMs) > ESCORT_STUCK_MS) { this.escortJump(actor, near); actor.progressAtMs = nowMs; return; }
    if (nowMs - (actor.persistAtMs || 0) >= ESCORT_PERSIST_MS) { actor.persistAtMs = nowMs; this.persistQuestGroup(group); }
  }

  // Zelf de weg: één hele route naar het gebied. true = er is een route om te volgen; false = (nog) geen route.
  escortLeadRoute(actor, info, nowMs) {
    const target = info.target;
    if (actor.path.length && actor.pathGoal && actor.pathGoal.x === target.x && actor.pathGoal.z === target.z) return true;
    if (nowMs < (actor.routeRetryAtMs || 0)) return false;
    this.perf.pathQueries += 1;
    const result = this.navigatorFor(ESCORT_RADIUS_MM).findPath({ x: actor.x, y: actor.y, z: actor.z }, { x: target.x, z: target.z },
      // Via het wegennet (🛣️ Weg) als dat er is, net als een speler die klikt.
      { maxExpanded: ESCORT_ROUTE_EXPANDED, maxChecks: ESCORT_ROUTE_CHECKS, roads: true });
    if (result.ok && result.points.length) {
      actor.path = result.points.slice(); actor.pathGoal = { x: target.x, z: target.z }; actor.stuck = 0; actor.routeFails = 0;
      return true;
    }
    // Geen route: later opnieuw (steeds wat later, zodat de server niet blijft zoeken).
    actor.routeFails = (actor.routeFails || 0) + 1;
    actor.routeRetryAtMs = nowMs + ESCORT_ROUTE_RETRY_MS * 2 ** Math.min(3, actor.routeFails - 1);
    return false;
  }

  // Een stap richting het doel: via de route, of (nog geen route) recht erop af met dezelfde botsing als spelers,
  // zodat hij nooit stil staat te wachten. true = hij kwam vooruit.
  escortMove(actor, goal, budget, chasing, nowMs) {
    const x = actor.x; const z = actor.z;
    this.moveTowards(actor, goal, budget, chasing);
    let moved = Math.hypot(actor.x - x, actor.z - z) > 0.01;
    if (!moved) {
      const dx = goal.x - actor.x; const dz = goal.z - actor.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(distance, (actor.def.moveSpeedMmPerS / 1000) * (AI_STEP_MS / 1000));
      if (step > 0.01) {
        const context = this.worldContextRef;
        const result = resolveMovement({ x: actor.x, y: actor.y, z: actor.z }, { x: actor.x + (dx / distance) * step, y: actor.y, z: actor.z + (dz / distance) * step },
          { radius: meters(ESCORT_RADIUS_MM), index: context?.walkabilityIndex || null, solids: context?.solidColliders || [] });
        if (Number.isFinite(result?.x) && Math.hypot(result.x - actor.x, result.z - actor.z) > step * 0.2) {
          actor.ry = Math.atan2(result.x - actor.x, result.z - actor.z);
          actor.x = result.x; actor.z = result.z; actor.y = Number.isFinite(result.y) ? result.y : actor.y;
          actor.rev += 1;
          moved = true;
        }
      }
      this.setAnim(actor, moved ? "walk" : "idle");
    }
    return moved;
  }

  // Vecht mee: de dichtstbijzijnde vijand die hem of iemand van jullie aanvalt (of vlakbij is), erheen en slaan.
  // Hij laat de laatste klap aan jullie (minstens 1 leven over): dan krijgen jullie de buit en telt hij voor de quest.
  escortFight(actor, info, nowMs, budget, players) {
    let foe = null;
    let foeDistance = Infinity;
    for (const enemy of this.actors.values()) {
      if (enemy.escort || enemy.state === "dead" || enemy.hp <= 1 || enemy.state !== "engage") continue;
      const onUs = enemy.targetEscort ? enemy.targetPlayerId === actor.spawnKey : actor.group.members.has(enemy.targetPlayerId);
      if (!onUs) continue;
      if (enemy.group && !Array.from(actor.group.members).some((id) => this.canSeeGroup(enemy.group, id))) continue;
      const distance = Math.hypot(enemy.x - actor.x, enemy.z - actor.z);
      if (distance <= ESCORT_FIGHT_M && distance < foeDistance) { foe = enemy; foeDistance = distance; }
    }
    if (!foe) return false;
    actor.state = "fight";
    const reach = ESCORT_REACH_M + meters(foe.def.radiusMm || 500);
    if (foeDistance > reach) {
      actor.def.moveSpeedMmPerS = Math.round(this.playerSpeed() * 1000);
      this.escortMove(actor, foe, budget, true, nowMs);
      return true;
    }
    actor.path = [];
    const facing = Math.atan2(foe.x - actor.x, foe.z - actor.z);
    if (Math.abs(facing - actor.ry) > 0.05) { actor.ry = facing; actor.rev += 1; }
    if (nowMs < (actor.nextAttackAtMs || 0)) { if (actor.anim === "walk") this.setAnim(actor, "idle"); return true; }
    actor.nextAttackAtMs = nowMs + ESCORT_HIT_MS;
    const damage = Math.min(Math.max(1, info.power || 5), foe.hp - 1);
    actor.anim = "attack";
    actor.animUntilMs = nowMs + ATTACK_ANIM_MS;
    actor.rev += 1;
    if (damage > 0) {
      foe.hp -= damage;
      foe.rev += 1;
      this.emitEvent({ e: "hit", id: foe.id, by: actor.id, amount: damage, hp: foe.hp }, foe.x, foe.z, foe);
    }
    return true;
  }

  attackEscort(actor, escort, ability, nowMs) {
    actor.nextAttackAtMs = nowMs + Math.max(100, ability.cooldownMs);
    actor.anim = "attack";
    actor.animUntilMs = nowMs + ATTACK_ANIM_MS;
    actor.rev += 1;
    const damage = Math.max(0, Math.round(computeDamage(ability, actor.def.attackPower, 0)));
    escort.hp = Math.max(0, escort.hp - damage);
    escort.hitAtMs = nowMs;
    escort.rev += 1;
    const defeated = escort.hp === 0;
    this.emitEvent({ e: "attack", id: actor.id, target: escort.id, amount: damage, remainingHealth: escort.hp, defeated }, actor.x, actor.z, actor);
    if (defeated) { this.escortDown(escort, nowMs); this.startReturn(actor); }
  }

  // Gevallen: even liggen, dan weg. De quest-motor beslist (stap opnieuw, mislukt of naar een stap).
  escortDown(escort, nowMs) {
    const group = escort.group;
    escort.state = "dead";
    escort.anim = "dead";
    escort.hp = 0;
    escort.path = [];
    escort.respawnAtMs = nowMs + QUEST_CORPSE_MS;
    escort.rev += 1;
    if (group?.escort) {
      group.escort.dead = true;
      group.escort.deadUntil = nowMs + QUEST_CORPSE_MS;
      const spec = group.actors.find((entry) => entry.escort);
      if (spec) spec.dead = true;
      this.persistQuestGroup(group);
      this.escortNews.push({ kind: "down", group });
    }
    this.emitEvent({ e: "death", id: escort.id }, escort.x, escort.z, escort);
  }

  // Na de AI-stap: de quest-motor hoort wat er gebeurde (die kan dan een nieuwe NPC laten verschijnen).
  flushEscortNews() {
    if (!this.escortNews.length) return;
    const news = this.escortNews;
    this.escortNews = [];
    for (const item of news) {
      const handler = item.kind === "arrived" ? this.questEscortArrived : this.questEscortDown;
      if (typeof handler !== "function") continue;
      try { handler(item.group); } catch (error) { console.error("[actors] begeleiden doorgeven mislukt:", error.message); }
    }
  }

  snapshotForDebug() {
    return {
      buildId: this.buildId,
      actors: this.actors.size,
      resources: this.resources.size,
      questGroups: this.questGroups.size,
      perf: Object.assign({}, this.perf),
      navigators: Array.from(this.navigators.entries()).map(([radiusMm, nav]) => Object.assign({ radiusMm }, nav.stats()))
    };
  }
}
