// Fase 05 (F5-E1-T03 + F5-E2-T02/T03/T05): vijanden en grondstoffen uit de actieve build, server-authoritative.
// - AI op 10 Hz: stil / patrouille / aanvallen / terug naar huis / dood. Slaapt als er geen speler in de buurt is.
// - Beweging via dezelfde botsingsfunctie als spelers (resolveMovement); routes via navigation.js met een budget.
// - Spelersaanval en verzamelen: plan (puur) -> node03 schrijft in één transactie -> pas daarna in het geheugen.
// - Naar de game: actor:snapshot (alleen wat in de buurt is en veranderde) en actor:event.
import { computeDamage, lootSeed, rollLoot, withinRangeMm } from "../../../apps/web/public/shared/combat-math.js";
import { metersToMm, resolveMembership } from "../../../apps/web/public/shared/spatial.js";
import { resolveMovement, walkableSurfaceHeightAt } from "../../../apps/web/public/shared/movement-kernel.js";
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
const REPATH_DISTANCE_M = 1.5;
const PATH_FAILS_BEFORE_RETURN = 3;
const PATROL_PAUSE_MS = 2000;
const HOME_REACHED_M = 0.6;
const PLAYER_RADIUS_MM = 500;
const RANGE_SLACK_MM = 300;
const ATTACK_ANIM_MS = 600;

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
//         connections(worldId) -> [{ id, player: { id }, ws }], send(connection, payload) }
export class ActorRuntime {
  constructor(host) {
    this.host = host;
    this.bridge = null;
    this.buildId = null;
    this.section = null;
    this.worldId = null;
    this.worldContextRef = null;
    this.actors = new Map(); // instance-id zonder occurrence (spawnKey) -> actor
    this.resources = new Map();
    this.navigators = new Map();
    this.pending = new Map();
    this.playerAttackAtMs = new Map();
    this.sentByConnection = new Map();
    this.accumulatorMs = 0;
    this.lastSnapshotAtMs = 0;
    this.lastStepAtMs = 0;
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
    if (worldContext !== this.worldContextRef) {
      this.worldContextRef = worldContext;
      this.navigators.clear();
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
      const y = index ? walkableSurfaceHeightAt(index, x, z, fallback, 0) : null;
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
    const players = this.playersForStep();
    const playerList = Array.from(players.values());
    const near = (x, z, range) => playerList.some((p) => Math.hypot(p.x - x, p.z - z) <= range);
    const budget = { left: PATH_QUERIES_PER_STEP };
    for (const resource of this.resources.values()) {
      if (!resource.available && nowMs >= resource.respawnAtMs) this.respawnResource(resource);
    }
    for (const actor of this.actors.values()) {
      if (actor.state === "dead") {
        if (nowMs >= actor.respawnAtMs) this.respawnActor(actor, nowMs);
        continue;
      }
      if (actor.state !== "return" && actor.state !== "engage" && !near(actor.x, actor.z, WAKE_M) && !near(actor.home.x, actor.home.z, WAKE_M)) continue;
      this.stepActor(actor, nowMs, players, playerList, budget);
    }
  }

  eligibleTarget(actor, player) {
    if (!player || player.defeated || player.safe) return false;
    return Math.hypot(player.x - actor.home.x, player.z - actor.home.z) <= meters(actor.def.leashRangeMm) + 2;
  }

  stepActor(actor, nowMs, players, playerList, budget) {
    const def = actor.def;
    if (actor.anim === "attack" && nowMs >= actor.animUntilMs) this.setAnim(actor, "idle");
    if (actor.state === "idle" || actor.state === "patrol") {
      if (def.behavior === "aggressive" && def.aggroRangeMm > 0) {
        let best = null;
        let bestDistance = Infinity;
        for (const player of playerList) {
          if (!this.eligibleTarget(actor, player)) continue;
          const distance = Math.hypot(player.x - actor.x, player.z - actor.z);
          if (distance <= meters(def.aggroRangeMm) && distance < bestDistance) { best = player; bestDistance = distance; }
        }
        if (best) this.engage(actor, best.id);
      }
      if (actor.state !== "engage") {
        if (actor.patrol.length >= 2) this.stepPatrol(actor, nowMs, budget);
        else if (Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z) > HOME_REACHED_M) this.moveTowards(actor, actor.home, budget, false);
        else this.setAnim(actor, "idle");
        return;
      }
    }
    if (actor.state === "engage") {
      const target = players.get(actor.targetPlayerId);
      const fromHome = Math.hypot(actor.x - actor.home.x, actor.z - actor.home.z);
      if (!this.eligibleTarget(actor, target) || fromHome > meters(def.leashRangeMm)) { this.startReturn(actor); return; }
      const ability = this.section.abilities?.[def.abilityId];
      if (!ability) { this.startReturn(actor); return; }
      const reachMm = ability.rangeMm + def.radiusMm + PLAYER_RADIUS_MM;
      if (withinRangeMm(mm(actor.x), mm(actor.z), mm(target.x), mm(target.z), reachMm)) {
        actor.path = [];
        const facing = Math.atan2(target.x - actor.x, target.z - actor.z);
        if (Math.abs(facing - actor.ry) > 0.05) { actor.ry = facing; actor.rev += 1; }
        if (nowMs >= actor.nextAttackAtMs) this.attackPlayer(actor, target, ability, nowMs);
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

  engage(actor, playerId) {
    actor.state = "engage";
    actor.targetPlayerId = playerId;
    actor.path = [];
    actor.pathGoal = null;
    actor.pathFails = 0;
    actor.rev += 1;
  }

  startReturn(actor) {
    actor.state = "return";
    actor.targetPlayerId = null;
    actor.path = [];
    actor.pathGoal = null;
    actor.pathFails = 0;
    actor.rev += 1;
  }

  setAnim(actor, anim) {
    if (actor.anim === anim) return;
    actor.anim = anim;
    actor.rev += 1;
  }

  // Loopt een stap richting goal. Geeft false als er geen route was of de vijand vastzit.
  moveTowards(actor, goal, budget, chasing) {
    const needPath = !actor.path.length || !actor.pathGoal || Math.hypot(actor.pathGoal.x - goal.x, actor.pathGoal.z - goal.z) > (chasing ? REPATH_DISTANCE_M : 0.1);
    let routeOk = true;
    if (needPath) {
      if (budget.left > 0) {
        budget.left -= 1;
        this.perf.pathQueries += 1;
        const result = this.navigatorFor(actor.def.radiusMm).findPath({ x: actor.x, z: actor.z }, { x: goal.x, z: goal.z }, { maxExpanded: PATH_MAX_EXPANDED });
        actor.path = result.ok ? result.points.slice() : [{ x: goal.x, z: goal.z }];
        routeOk = result.ok;
      } else {
        this.perf.pathBudgetHits += 1;
        if (!actor.path.length) actor.path = [{ x: goal.x, z: goal.z }];
      }
      actor.pathGoal = { x: goal.x, z: goal.z };
    }
    const moved = this.followPath(actor);
    if (routeOk && moved) actor.pathFails = 0;
    return routeOk && moved;
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
      if (distance <= 0.05) { actor.path.shift(); continue; }
      const step = Math.min(distance, remaining);
      const desired = { x: actor.x + (dx / distance) * step, y: actor.y, z: actor.z + (dz / distance) * step };
      const result = resolveMovement({ x: actor.x, y: actor.y, z: actor.z }, desired, { radius, index: context?.walkabilityIndex || null, solids: context?.solidColliders || [] });
      const moved = Math.hypot(result.x - actor.x, result.z - actor.z);
      actor.ry = Math.atan2(dx, dz);
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
    this.emitEvent({ e: "attack", id: actor.id, target: target.id, amount: outcome?.damage ?? null, remainingHealth: outcome?.remainingHealth ?? null, defeated: outcome?.defeated === true }, actor.x, actor.z);
    if (outcome?.defeated) this.startReturn(actor);
  }

  respawnActor(actor, nowMs) {
    actor.occurrence += 1;
    actor.id = actor.spawnKey + ":" + actor.occurrence;
    actor.state = "idle";
    actor.hp = actor.hpMax;
    actor.x = actor.home.x; actor.z = actor.home.z; actor.y = this.groundYAt(actor.x, actor.z);
    actor.path = []; actor.pathGoal = null; actor.targetPlayerId = null; actor.patrolIndex = 0; actor.pauseUntilMs = 0;
    actor.contributors = new Set();
    actor.anim = "idle";
    actor.nextAttackAtMs = nowMs + 1000;
    actor.rev += 1;
    this.persistState(actor.spawnKey, actor.occurrence, "alive", null);
    this.emitEvent({ e: "respawn", id: actor.id }, actor.x, actor.z);
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

  // ctx: { playerId, x, z (m), safe, attackPower, nowMs, operationId }. Puur: verandert het geheugen niet.
  planPlayerAttack(ctx) {
    const section = this.ensureBuild(ctx.nowMs);
    const { entry: actor, stale } = this.findByInstanceId(ctx.targetId);
    if (!section || !actor || actor.kind !== "actor") throw httpError(404, "Vijand niet gevonden.");
    const label = actor.def.displayName;
    if (stale || actor.state === "dead") return { plan: null, result: { action: "attack", targetId: ctx.targetId, message: label + " is al verslagen.", events: [] } };
    if (ctx.safe || this.pointIsSafe(actor.x, actor.z)) throw httpError(409, "Hier kun je niet vechten (veilig gebied).", "SAFE_AREA");
    const ability = playerAbilityFromSection(section);
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
      kind: "attack", instanceId: actor.id, spawnKey: actor.spawnKey, occurrence: actor.occurrence, playerId: ctx.playerId,
      damage, hpAfter, killed, respawnAtMs: killed ? ctx.nowMs + actor.def.respawnMs : null, rewards, buildId: this.buildId, label
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
    const reachMm = resource.def.gatherRangeMm + resource.def.radiusMm + RANGE_SLACK_MM;
    if (!withinRangeMm(mm(ctx.x), mm(ctx.z), mm(resource.x), mm(resource.z), reachMm)) {
      const error = httpError(400, "Target is te ver weg voor gather.", "TARGET_OUT_OF_RANGE");
      error.details = { range: meters(resource.def.gatherRangeMm), radius: meters(resource.def.radiusMm) };
      throw error;
    }
    const plan = {
      kind: "gather", instanceId: resource.id, spawnKey: resource.spawnKey, occurrence: resource.occurrence, playerId: ctx.playerId,
      claimKey: resource.id, items: rollLoot(section.lootTables, resource.def.lootTableId, lootSeed(this.buildId, resource.id, ctx.playerId)),
      respawnAtMs: ctx.nowMs + resource.def.respawnMs, buildId: this.buildId, label
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
      resource.available = false;
      resource.respawnAtMs = plan.respawnAtMs;
      resource.rev += 1;
      this.emitEvent({ e: "gathered", id: resource.id, by: plan.playerId }, resource.x, resource.z);
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
      this.emitEvent({ e: "death", id: actor.id, by: plan.playerId, amount: plan.damage }, actor.x, actor.z);
      return;
    }
    this.emitEvent({ e: "hit", id: actor.id, by: plan.playerId, amount: plan.damage, hp: actor.hp }, actor.x, actor.z);
    if (actor.state !== "engage" && actor.state !== "return") this.engage(actor, plan.playerId);
  }

  // ---- naar de clients ------------------------------------------------------------------------------------

  encode(entry) {
    if (entry.kind === "resource") {
      return { id: entry.id, k: "r", d: entry.def.resourceId, x: r2(entry.x), y: r2(entry.y), z: r2(entry.z), s: entry.available ? "i" : "d" };
    }
    const s = entry.state === "dead" ? "d" : entry.anim === "attack" ? "a" : entry.anim === "walk" ? "w" : "i";
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
      const actors = [];
      const nearIds = new Set();
      for (const entry of all) {
        if (Math.abs(entry.x - px) > AOI_M || Math.abs(entry.z - pz) > AOI_M) continue;
        nearIds.add(entry.id);
        const sig = entry.rev + ":" + entry.id;
        if (!full && sent.sigs.get(entry.id) === sig) continue;
        sent.sigs.set(entry.id, sig);
        actors.push(this.encode(entry));
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

  emitEvent(event, x, z) {
    if (!this.worldId) return;
    const connections = this.host.connections(this.worldId);
    if (!connections.length) return;
    const positions = new Map();
    for (const state of this.host.playerStates(this.worldId)) if (state?.player_id) positions.set(state.player_id, state);
    const payload = Object.assign({ type: "actor:event", serverTimeMs: Date.now() }, event);
    for (const connection of connections) {
      const position = positions.get(connection.player?.id);
      const isTarget = event.target && connection.player?.id === event.target;
      if (!isTarget && (!position || Math.abs(Number(position.x) - x) > AOI_M || Math.abs(Number(position.z) - z) > AOI_M)) continue;
      this.host.send(connection, payload);
    }
  }

  snapshotForDebug() {
    return {
      buildId: this.buildId,
      actors: this.actors.size,
      resources: this.resources.size,
      perf: Object.assign({}, this.perf),
      navigators: Array.from(this.navigators.entries()).map(([radiusMm, nav]) => Object.assign({ radiusMm }, nav.stats()))
    };
  }
}
