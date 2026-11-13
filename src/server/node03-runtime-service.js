import crypto from "node:crypto";
import { ActionCooldowns, assertDeveloperActionAllowed, developerActionsAllowed, normalizedActionPayloadHash } from "./action-security.js";
import { runOperation } from "./persistence/operation-contract.js";
import { economyValues } from "../shared/authoring/kinds/economy.js";
import { isCombatIntent, sanitizeCombatIntent } from "./runtime/combat-adapter.js";
import { computeDamage } from "../../apps/web/public/shared/combat-math.js";
import { equipBonusAt, levelEdgePct, statAtLevel, toRealPool } from "../../apps/web/public/shared/level-math.js";
import { isActorInstanceId, isResourceInstanceId } from "./runtime/actor-runtime.js";
import { computeHeal, describeEffect, effectBonuses, effectFromSource } from "../../apps/web/public/shared/effect-math.js";
import { applyEffect, clearEffectsForDeath, combatRulesFromProject, itemCooldowns, itemReadyInMs, loadActiveEffects, planEffect, publicEffects, scaledRespawnMs, scaledXp, setItemCooldown } from "./runtime/player-effects.js";
import { abilityFromSection, classSkillIdsFromSection, playerAbilityFromSection } from "./authoring/actor-compiler.js";
import { arrivalPoint, isUnlocked, nearestRespawnPortal, portalNear, portalRulesOf, portalsOf, portalVisibleFor, publicPortalState,
  storeUnlock, travelCost, unlockedPortalIds, withinUnlockRange } from "./runtime/portal-runtime.js";

const NODE03_INSTANCE_PREFIX = "node03:";
const HEALTH_STAT_ID = "stat.health";
const MANA_STAT_ID = "stat.mana";
const STAMINA_STAT_ID = "stat.stamina";
const ARMOR_STAT_ID = "stat.armor";
const ATTACK_POWER_STAT_ID = "stat.attack_power";
const HEAL_POWER_STAT_ID = "stat.heal_power";
const GOLD_CURRENCY_ID = "currency.gold";
const DEFAULT_CHARACTER_ID = "player.desert_guardian";
const DEFAULT_BIND_STATE = "unbound";
// Fase 8 herstel 2: zo lang blijft buit klaarliggen in het buitvenster als je hem (nog) niet pakt.
const LOOT_KEEP_MS = 5 * 60 * 1000;
// Fase 5: indeling van vak 2 en 3 per character (player_ability_loadouts).
const HOTBAR_LOADOUT_ID = "hotbar";
// Fase 6: balken (houden hun stand); de andere stats (kracht, pantser, heal-kracht) staan altijd op hun maximum.
const POOL_STAT_IDS = new Set([HEALTH_STAT_ID, MANA_STAT_ID, STAMINA_STAT_ID]);
const SKILL_SLOTS = Object.freeze([2, 3]);

function now() {
  return new Date().toISOString();
}

function addMs(ms) {
  return new Date(Date.now() + Math.max(0, Number(ms) || 0)).toISOString();
}

function safeString(value, fallback = "") {
  const text = String(value === null || value === undefined ? "" : value).trim();
  return text || fallback;
}

function safeEntityReferenceId(value, fallback = "entity") {
  const normalized = safeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || fallback;
  if (normalized.length <= 64) return normalized;
  const hash = crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 8);
  return normalized.slice(0, 55).replace(/[:_-]+$/g, "") + "_" + hash;
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

// Random whole amount between minimum and maximum (inclusive), scaled by a
// yield multiplier. 0 means "nothing this time".
function rollLootAmount(minValue, maxValue, multiplier = 1) {
  const min = Math.max(0, safeInteger(minValue, 1));
  const max = Math.max(min, safeInteger(maxValue, min));
  const rolled = min + Math.floor(Math.random() * (max - min + 1));
  return Math.max(0, Math.round(rolled * multiplier));
}

function httpError(status, message, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function inventoryVariantKey(row) {
  const exactState = JSON.stringify({
    itemId: safeString(row?.item_id, ""),
    bindState: safeString(row?.bind_state, DEFAULT_BIND_STATE),
    quality: row?.quality ?? null,
    durability: row?.durability ?? null,
    maxDurability: row?.max_durability ?? null,
    modifiers: safeJsonParse(row?.modifiers_json, [])
  });
  return crypto.createHash("sha256").update(exactState).digest("hex").slice(0, 20);
}

function stableJson(value) {
  return JSON.stringify(value);
}

function operationIdFromPayload(payload) {
  return safeString(payload?.operationId || payload?.operation_id || "", "");
}

function randomId(prefix) {
  return prefix + "_" + crypto.randomUUID();
}

function catalogSection(catalogs, key) {
  return catalogs && typeof catalogs[key] === "object" && catalogs[key] ? catalogs[key] : {};
}

function firstObjectValue(source) {
  const values = Object.values(source || {});
  return values.length ? values[0] : null;
}

function resolveCatalogs(world) {
  return world?.gameProject?.catalogs || world?.catalogs || {};
}

function resolveProject(world) {
  return world?.gameProject || {};
}

function policiesOfType(project, type) {
  return Array.isArray(project?.playerRules?.byType?.[type]) ? project.playerRules.byType[type] : [];
}

function uiModules(project) {
  return Array.isArray(project?.ui?.modules) ? project.ui.modules : [];
}

function interactionHudConfig(project) {
  return uiModules(project).find(function (module) {
    return module && module.nodeType === "interaction_hud" && module.moduleId;
  }) || null;
}

function gameMinimapHudConfigs(project) {
  const configs = uiModules(project).filter(function (module) {
    return module && module.nodeType === "game_minimap_hud" && module.moduleId;
  });
  const ui = project?.ui || {};
  if (Array.isArray(ui.minimap)) {
    configs.push.apply(configs, ui.minimap.filter(Boolean));
  } else if (ui.minimap && typeof ui.minimap === "object") {
    configs.push(ui.minimap);
  }
  if (project?.legacyWorld?.minimap?.game) configs.push(project.legacyWorld.minimap.game);
  return configs;
}

function runtimeTargetScope(project) {
  const interactionHud = interactionHudConfig(project) || {};
  const scopes = [interactionHud.runtimeTargetScope].concat(gameMinimapHudConfigs(project).map(function (config) {
    return config?.runtimeTargetScope;
  }));
  if (scopes.some(function (scope) { return safeString(scope, "") === "all_published_zones"; })) return "all_published_zones";
  return safeString(scopes.find(function (scope) { return safeString(scope, ""); }), "current_zone");
}

function usesAllPublishedZoneTargets(project) {
  return runtimeTargetScope(project) === "all_published_zones";
}

function projectZonePackages(project) {
  const zones = project?.zones || {};
  const list = [];
  if (Array.isArray(zones.packages)) list.push.apply(list, zones.packages);
  if (zones.byId && typeof zones.byId === "object") list.push.apply(list, Object.values(zones.byId));
  const seen = new Set();
  return list.filter(function (zonePackage) {
    const zoneId = safeString(zonePackage?.zoneId || zonePackage?.id, "");
    if (!zoneId || seen.has(zoneId)) return false;
    seen.add(zoneId);
    return true;
  });
}

function projectZonePackageById(project, zoneId) {
  const id = safeString(zoneId, "");
  if (!id) return null;
  return project?.zones?.byId?.[id] || projectZonePackages(project).find(function (zonePackage) {
    return safeString(zonePackage?.zoneId || zonePackage?.id, "") === id;
  }) || null;
}

function node03InstanceZoneId(instanceId) {
  const id = safeString(instanceId, "");
  if (!id.startsWith(NODE03_INSTANCE_PREFIX)) return "";
  const rest = id.slice(NODE03_INSTANCE_PREFIX.length);
  const separatorIndex = rest.indexOf(":");
  return separatorIndex > 0 ? rest.slice(0, separatorIndex) : "";
}

function formulaValue(formula, fallback = 0) {
  if (typeof formula === "number") return safeNumber(formula, fallback);
  if (!formula || typeof formula !== "object") return fallback;
  const operands = Array.isArray(formula.operands) ? formula.operands : [];
  if (formula.operator === "add") {
    return operands.reduce(function (total, item) { return total + safeNumber(item, 0); }, 0);
  }
  if (formula.operator === "multiply") {
    return operands.reduce(function (total, item) { return total * safeNumber(item, 1); }, 1);
  }
  return fallback;
}

function statBlockValues(catalogs, statBlockRef) {
  const block = catalogSection(catalogs, "statBlocks")[statBlockRef] || null;
  const result = {};
  for (const entry of Array.isArray(block?.entries) ? block.entries : []) {
    const statRef = safeString(entry?.statRef, "");
    if (!statRef) continue;
    result[statRef] = safeNumber(entry?.baseValue, 0);
  }
  return result;
}

// Fase 6: wat een klasse er per level bij krijgt (per stat). Een oudere build zonder groei geeft overal 0.
function statBlockGrowth(catalogs, statBlockRef) {
  const block = catalogSection(catalogs, "statBlocks")[statBlockRef] || null;
  const result = {};
  for (const entry of Array.isArray(block?.entries) ? block.entries : []) {
    const statRef = safeString(entry?.statRef, "");
    if (statRef) result[statRef] = Math.max(0, safeNumber(entry?.perLevel, 0));
  }
  return result;
}

function applyStatMultipliers(baseStats, variant) {
  const multipliers = variant && typeof variant.statMultipliers === "object" ? variant.statMultipliers : {};
  const result = Object.assign({}, baseStats);
  for (const [statId, multiplier] of Object.entries(multipliers)) {
    if (!Object.prototype.hasOwnProperty.call(result, statId)) continue;
    result[statId] = result[statId] * safeNumber(multiplier, 1);
  }
  return result;
}

// Fase 6: de XP-tabel heeft een punt per level; sorteren doen we één keer per curve (niet bij elke vraag).
const CURVE_POINTS = new WeakMap();
function sortedCurvePoints(curve) {
  if (!curve || typeof curve !== "object") return [];
  let points = CURVE_POINTS.get(curve);
  if (points) return points;
  points = (Array.isArray(curve.points) ? curve.points : [])
    .map(function (point) {
      return { x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) };
    })
    .filter(function (point) { return Number.isFinite(point.x) && Number.isFinite(point.y); })
    .sort(function (left, right) { return left.x - right.x; });
  CURVE_POINTS.set(curve, points);
  return points;
}

function xpForLevel(catalogs, curveRef, level) {
  const targetLevel = Math.max(1, safeInteger(level, 1));
  if (targetLevel <= 1) return 0;
  const curve = catalogSection(catalogs, "statCurves")[curveRef] || firstObjectValue(catalogSection(catalogs, "statCurves"));
  const points = sortedCurvePoints(curve);
  if (!points.length) return (targetLevel - 1) * 100;
  const exact = points.find(function (point) { return point.x === targetLevel; });
  if (exact) return Math.max(0, Math.floor(exact.y));
  const before = points.filter(function (point) { return point.x < targetLevel; }).pop() || points[0];
  const after = points.find(function (point) { return point.x > targetLevel; }) || null;
  if (!after || after.x === before.x) {
    const step = points.length > 1 ? Math.max(1, points[points.length - 1].y - points[points.length - 2].y) : 100;
    return Math.max(0, Math.floor(before.y + (targetLevel - before.x) * step));
  }
  const t = (targetLevel - before.x) / (after.x - before.x);
  return Math.max(0, Math.floor(before.y + (after.y - before.y) * t));
}

function levelForXp(catalogs, curveRef, xp, maxLevel) {
  const totalXp = Math.max(0, safeInteger(xp, 0));
  const cap = Math.max(1, safeInteger(maxLevel, 10));
  let level = 1;
  while (level < cap && totalXp >= xpForLevel(catalogs, curveRef, level + 1)) {
    level += 1;
  }
  return level;
}

function positionDistance(position, entity) {
  if (!position || !entity) return null;
  return Math.hypot(safeNumber(position.x, 0) - safeNumber(entity.x, 0), safeNumber(position.z, 0) - safeNumber(entity.z, 0));
}

function spawnOffset(index, count, radius) {
  const total = Math.max(1, safeInteger(count, 1));
  const angle = (index * 137.50776405003785) * Math.PI / 180;
  const distance = safeNumber(radius, 0) * (0.2 + ((index % total) + 1) / (total + 1) * 0.68);
  return {
    x: Math.cos(angle) * distance,
    z: Math.sin(angle) * distance
  };
}

function displayForItem(catalogs, itemId) {
  const item = catalogSection(catalogs, "items")[itemId] || {};
  return item.displayName || itemId;
}

function displayForCurrency(catalogs, currencyId) {
  const currency = catalogSection(catalogs, "currencies")[currencyId] || {};
  return currency.displayName || currencyId;
}

function displayForAbility(catalogs, abilityId) {
  const ability = catalogSection(catalogs, "abilities")[abilityId] || {};
  return ability.displayName || abilityId;
}

function healthFromStats(stats) {
  return Math.max(1, Math.round(safeNumber(stats[HEALTH_STAT_ID], 50)));
}

function statValue(rowsById, statId, fallback = 0) {
  const row = rowsById[statId] || null;
  if (!row) return fallback;
  const max = safeNumber(row.baseValue, 0) + safeNumber(row.earnedValue, 0);
  return row.currentValue === null || row.currentValue === undefined ? max : safeNumber(row.currentValue, max);
}

function effectiveMaxStat(row, fallback = 0) {
  if (!row) return fallback;
  return safeNumber(row.baseValue, 0) + safeNumber(row.earnedValue, 0);
}

function normalizeTargetKinds(value) {
  const source = Array.isArray(value) ? value : ["enemy", "resource", "pickup", "zone_link"];
  const allowed = new Set(["enemy", "resource", "pickup", "zone_link"]);
  return source.map(function (kind) { return safeString(kind, "").toLowerCase(); }).filter(function (kind) {
    return allowed.has(kind);
  });
}

function zoneDefaultSpawn(zonePackage, world) {
  const spawns = Array.isArray(zonePackage?.spawns) ? zonePackage.spawns : [];
  return spawns.find(function (spawn) { return spawn.role === "zone_default"; }) || {
    spawnId: world?.spawn?.spawnId || null,
    zoneRef: zonePackage?.zoneId || world?.activeZoneId || null,
    x: safeNumber(world?.spawn?.x, 0),
    y: safeNumber(world?.spawn?.y, 0),
    z: safeNumber(world?.spawn?.z, 0),
    facing: safeNumber(world?.spawn?.facing, 0)
  };
}

function respawnDelayMs(catalogs, respawnPolicyRef) {
  const policy = catalogSection(catalogs, "respawnPolicies")[respawnPolicyRef] || firstObjectValue(catalogSection(catalogs, "respawnPolicies")) || {};
  const min = safeNumber(policy.minDelayMs, 5000);
  const max = safeNumber(policy.maxDelayMs, min);
  return Math.max(0, Math.round((min + max) / 2));
}

const WORLD_ENTITY_ACTIONS = new Set(["attack", "gather", "pickup", "reset_demo", "reset"]);

export class Node03RuntimeService {
  constructor(db, repository, mmoService) {
    this.db = db;
    this.repository = repository;
    this.mmoService = mmoService;
    this.actionCooldowns = new ActionCooldowns();
    // Portals (8-11): wachttijd na reizen per speler (in het geheugen; na een herstart mag je meteen weer).
    this.portalCooldowns = new Map();
    // Fase 05: canonieke vijanden slaan spelers via deze service (enige schrijver van player_stats).
    if (mmoService?.actorRuntime && typeof mmoService.actorRuntime.setCombatBridge === "function") mmoService.actorRuntime.setCombatBridge(this);
  }

  actorRuntime() {
    return this.mmoService?.actorRuntime || null;
  }

  // Healing (2-11): regeneratie en zwevende getallen (1x per seconde in de worldtick).
  vitals() {
    return this.mmoService?.vitalsRuntime || null;
  }

  // Fase 7: de terugkomtijd van dit beleid, met de knop Terugkomen (Instellingen > Balans) erover.
  respawnDelay(ctx, respawnPolicyRef) {
    return scaledRespawnMs(respawnDelayMs(ctx.catalogs, respawnPolicyRef), this.combatRules(ctx.project).respawnRatePct);
  }

  combatRules(project = null) {
    let source = project;
    if (!source) { try { source = resolveProject(this.mmoService.getPublishedWorldContext().world); } catch { source = null; } }
    return combatRulesFromProject(source);
  }

  // Zwevend getal boven een speler (genezen door een ander): naar iedereen in de buurt.
  broadcastFx(worldId, payload) {
    try {
      if (this.mmoService && typeof this.mmoService.broadcastToWorld === "function") this.mmoService.broadcastToWorld(worldId, Object.assign({ type: "fx", serverTimeMs: Date.now() }, payload));
    } catch {}
  }

  getRequestContext(req) {
    const sessionContext = this.mmoService.getSessionContextFromRequest(req);
    this.mmoService.authService.touchSession(sessionContext.session.id, false);
    const worldContext = this.mmoService.getPublishedWorldContext();
    const profile = this.mmoService.ensurePlayerProfile(sessionContext.user, worldContext);
    const position = this.mmoService.ensurePlayerPosition(profile, worldContext, sessionContext);
    const world = worldContext.world;
    const project = resolveProject(world);
    const catalogs = resolveCatalogs(world);
    const zonePackage = this.resolveCurrentZonePackage(world, position);
    if (!zonePackage?.zoneId) {
      const error = new Error("Spelgebied niet gevonden. Publiceer de wereld opnieuw.");
      error.status = 404;
      throw error;
    }
    return {
      sessionContext,
      worldContext,
      world,
      project,
      catalogs,
      profile,
      position,
      zonePackage,
      zoneId: zonePackage.zoneId,
      worldId: worldContext.worldId
    };
  }

  // Quest Builder (5-11): de admin werkt vanuit de editor aan de stand van een speler, zonder sessie van die speler.
  adminContextForPlayer(playerId) {
    const profile = this.db.prepare("SELECT * FROM player_profiles WHERE id = ? LIMIT 1").get(safeString(playerId, ""));
    if (!profile) throw httpError(404, "Speler niet gevonden.");
    const worldContext = this.mmoService.getPublishedWorldContext();
    const world = worldContext.world;
    return { sessionContext: null, worldContext, world, project: resolveProject(world), catalogs: resolveCatalogs(world),
      profile, position: null, zonePackage: null, zoneId: profile.current_zone_id || null, worldId: worldContext.worldId };
  }

  resolveCurrentZonePackage(world, position) {
    const project = resolveProject(world);
    const packages = Array.isArray(project?.zones?.packages) ? project.zones.packages : [];
    const byId = project?.zones?.byId || {};
    const positionZoneId = safeString(position?.current_zone_id || position?.zoneId, "");
    if (positionZoneId && byId[positionZoneId]) return byId[positionZoneId];
    const activeZoneId = safeString(world?.activeZoneId || project?.runtime?.activeZoneId || world?.spawn?.zoneRef, "");
    if (activeZoneId && byId[activeZoneId]) return byId[activeZoneId];
    if (world?.zonePackage?.zoneId) return world.zonePackage;
    return packages[0] || null;
  }

  contextForZone(ctx, zonePackage) {
    return Object.assign({}, ctx, {
      zonePackage,
      zoneId: safeString(zonePackage?.zoneId || zonePackage?.id, ctx.zoneId)
    });
  }

  snapshotZoneContexts(ctx) {
    if (!usesAllPublishedZoneTargets(ctx.project)) return [ctx];
    const packages = projectZonePackages(ctx.project);
    const currentZoneId = safeString(ctx.zoneId, "");
    const hasCurrent = packages.some(function (zonePackage) {
      return safeString(zonePackage?.zoneId || zonePackage?.id, "") === currentZoneId;
    });
    if (!hasCurrent && ctx.zonePackage?.zoneId) packages.push(ctx.zonePackage);
    return packages.map((zonePackage) => this.contextForZone(ctx, zonePackage));
  }

  entityContextForInstance(ctx, instanceId) {
    if (!usesAllPublishedZoneTargets(ctx.project)) return ctx;
    const zoneId = node03InstanceZoneId(instanceId);
    if (!zoneId || zoneId === ctx.zoneId) return ctx;
    const zonePackage = projectZonePackageById(ctx.project, zoneId);
    return zonePackage?.zoneId ? this.contextForZone(ctx, zonePackage) : ctx;
  }

  ensureSnapshotEntityState(ctx) {
    for (const zoneCtx of this.snapshotZoneContexts(ctx)) this.ensureZoneEntityState(zoneCtx);
  }

  ensureActionEntityState(ctx, targetId) {
    const entityCtx = this.entityContextForInstance(ctx, targetId);
    this.ensureZoneEntityState(entityCtx);
  }

  snapshotForRequest(req) {
    const ctx = this.getRequestContext(req);
    this.ensurePlayerRuntime(ctx);
    this.ensureSnapshotEntityState(ctx);
    return this.buildSnapshot(ctx);
  }

  actionForRequest(req, rawPayload = {}) {
    const ctx = this.getRequestContext(req);
    const action = safeString(rawPayload.action, "").toLowerCase();
    // F2-E3-T01: attack/gather/pickup alleen als intentie (actie + doel); vervalste uitkomstvelden -> 400.
    const payload = isCombatIntent(action) ? sanitizeCombatIntent(action, rawPayload) : rawPayload;
    const operationId = operationIdFromPayload(payload) || randomId("node03_operation");
    const hash = normalizedActionPayloadHash(action, payload);
    if (["reset_demo", "reset", "debug_inventory_add", "inventory_add", "debug_inventory_remove", "inventory_remove", "debug_inventory_cleanup", "inventory_cleanup", "debug_level_reset", "level_reset", "debug_currency_add", "currency_add", "debug_currency_remove", "currency_remove"].includes(action)) {
      assertDeveloperActionAllowed(ctx);
    }
    // Fase 8 herstel 2: de speler zegt bij elke actie of buit meteen in de tas mag (Automatisch buit pakken).
    if (typeof payload.autoLoot === "boolean") this.rememberAutoLoot(ctx.profile.id, payload.autoLoot);
    // F2-E2-T07: loot, grant, death en receipt in een transactie; ACK pas na COMMIT.
    let response;
    try {
    response = runOperation(this.db, {
      operationId,
      playerId: ctx.profile.id,
      operationType: action || "unknown",
      requestHash: hash,
      label: "Deze spelactie",
      faultHook: this.operationFaultHook || null,
      beforeCommit: () => {
        if (action === "attack" || action === "gather") {
          const defaultCooldown = action === "attack" ? 250 : 500;
          const configured = Number(process.env[action === "attack" ? "GAME_ATTACK_COOLDOWN_MS" : "GAME_GATHER_COOLDOWN_MS"] || defaultCooldown);
          this.actionCooldowns.consume(ctx.profile.id + ":" + action, configured);
        }
      },
      perform: () => {
        this.ensurePlayerRuntime(ctx);
        this.ensureActionEntityState(ctx, payload.targetId);
        const result = this.performAction(ctx, action, payload, operationId);
        this.ensureSnapshotEntityState(ctx);
        return result;
      },
      buildResponse: (result) => Object.assign({ ok: true, operationId }, result, { snapshot: this.buildSnapshot(ctx) })
    });
    } catch (error) {
      this.actorRuntime()?.dropPending(operationId);
      throw error;
    }
    // Fase 05: een canonieke vijand/grondstof verandert pas in het geheugen na COMMIT (en nooit bij een replay).
    // Fase 5: een vaardigheid zonder doel kiest zelf een vijand; ook dan geldt de vijandenserver.
    const canonicalTarget = isActorInstanceId(payload.targetId) || isResourceInstanceId(payload.targetId) || action === "skill";
    if (canonicalTarget) {
      if (response.idempotent) this.actorRuntime()?.dropPending(operationId);
      else this.actorRuntime()?.applyPending(operationId);
    }
    if (!response.idempotent && !canonicalTarget && WORLD_ENTITY_ACTIONS.has(action)) this.notifyEntitiesChanged(ctx, payload.targetId, action);
    return response;
  }

  // Laat andere spelers direct weten dat een gedeeld object veranderde (verzameld, opgepakt, geraakt), zodat
  // het bij hen meteen verdwijnt in plaats van pas bij de volgende poll (2,5 s).
  notifyEntitiesChanged(ctx, targetId, action) {
    try {
      if (!this.mmoService || typeof this.mmoService.broadcastToWorld !== "function") return;
      this.mmoService.broadcastToWorld(ctx.worldId, {
        type: "node03:entities_changed",
        worldId: ctx.worldId,
        zoneId: node03InstanceZoneId(targetId) || ctx.zoneId || null,
        targetId: safeString(targetId, "") || null,
        action: action
      });
    } catch {}
  }

  ensurePlayerRuntime(ctx) {
    const character = this.resolvePlayerCharacter(ctx);
    this.ensureProgression(ctx, character);
    this.ensureStats(ctx, character);
    const startItemIds = this.ensureStartingInventoryAndCurrencies(ctx, character);
    this.ensureStarterEquipment(ctx, startItemIds);
  }

  // Klassen: de keuzes uit de actieve build (leeg = geen klassen, dan speelt iedereen de standaardspeler).
  playerClasses() {
    let catalogs = {};
    try { catalogs = resolveCatalogs(this.mmoService.getPublishedWorldContext().world); } catch {}
    const items = catalogSection(catalogs, "items");
    const currencies = catalogSection(catalogs, "currencies");
    return Object.values(catalogSection(catalogs, "playableCharacters"))
      .filter((character) => character?.classChoice === true)
      .sort((a, b) => safeNumber(a.sortOrder, 0) - safeNumber(b.sortOrder, 0))
      .map((character) => {
        const stats = statBlockValues(catalogs, character.statBlockRef);
        const start = []
          .concat((character.startingItemGrants || []).map((grant) => grant.amount + "× " + (items[grant.itemRef]?.displayName || grant.itemRef)))
          .concat((character.startingCurrencyGrants || []).map((grant) => grant.amountMinor + " " + (currencies[grant.currencyRef]?.displayName || grant.currencyRef)));
        return { classId: character.id, displayName: character.displayName || character.id, description: character.description || "",
          healthMax: stats[HEALTH_STAT_ID] || 0, attackPower: stats[ATTACK_POWER_STAT_ID] || 0, armor: stats[ARMOR_STAT_ID] || 0,
          healPower: stats[HEAL_POWER_STAT_ID] || 0, start, models: Array.isArray(character.modelAssetIds) ? character.modelAssetIds.slice() : [] };
      });
  }

  // Het character van dit account voor een klasse. Een oud character zonder (bestaande) klasse hoort bij de eerste klasse.
  profileForClass(userId, classId, classes) {
    const exact = this.db.prepare("SELECT * FROM player_profiles WHERE user_id = ? AND selected_character_id = ? ORDER BY created_at, id LIMIT 1").get(userId, classId);
    if (exact || classes[0]?.classId !== classId) return exact || null;
    const known = new Set(classes.map((entry) => entry.classId));
    return this.db.prepare("SELECT * FROM player_profiles WHERE user_id = ? ORDER BY created_at, id").all(userId)
      .find((profile) => !known.has(profile.selected_character_id)) || null;
  }

  // Characters-venster: per klasse jouw character (level, uiterlijk) of nog niets.
  charactersForRequest(req) {
    const { user } = this.mmoService.getSessionContextFromRequest(req);
    const classes = this.playerClasses();
    const active = this.mmoService.activeProfileForUser(user.id);
    const levelOf = this.db.prepare("SELECT level FROM player_progression WHERE player_id = ? LIMIT 1");
    return {
      ok: true,
      classes: classes.map((entry) => {
        const profile = this.profileForClass(user.id, entry.classId, classes);
        if (!profile) return Object.assign({}, entry, { character: null });
        const model = entry.models.includes(profile.model_asset_id) ? profile.model_asset_id : (entry.models[0] || null);
        return Object.assign({}, entry, { character: { profileId: profile.id, level: safeInteger(levelOf.get(profile.id)?.level, 1),
          modelAssetId: model, active: profile.id === active?.id } });
      })
    };
  }

  // Spelen met (of uiterlijk kiezen voor) de klasse. Nog geen character van die klasse = nieuw character dat opnieuw begint.
  playCharacterForRequest(req, body = {}) {
    const { user } = this.mmoService.getSessionContextFromRequest(req);
    const classes = this.playerClasses();
    const classId = safeString(body.classId, "");
    const entry = classes.find((candidate) => candidate.classId === classId);
    const fail = (message) => { const error = new Error(message); error.status = 400; return error; };
    if (!entry) throw fail("Die klasse bestaat niet (meer).");
    const modelAssetId = safeString(body.modelAssetId, "");
    if (modelAssetId && !entry.models.includes(modelAssetId)) throw fail("Dat uiterlijk hoort niet bij deze klasse.");
    const stamp = now();
    let profile = this.profileForClass(user.id, classId, classes);
    if (!profile) {
      const worldId = this.mmoService.getPublishedWorldContext().worldId;
      const profileId = randomId("player");
      this.db.prepare("INSERT INTO player_profiles (id, user_id, display_name, selected_character_id, current_world_id, current_zone_id, model_asset_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)")
        .run(profileId, user.id, user.username || "player", classId, worldId, modelAssetId || null, stamp, stamp);
      profile = { id: profileId };
    } else {
      this.db.prepare("UPDATE player_profiles SET selected_character_id = ?, model_asset_id = COALESCE(?, model_asset_id), updated_at = ? WHERE id = ?")
        .run(classId, modelAssetId || null, stamp, profile.id);
    }
    this.db.prepare("UPDATE users SET active_profile_id = ? WHERE id = ?").run(profile.id, user.id);
    return { ok: true, profileId: profile.id };
  }

  resolvePlayerCharacter(ctx) {
    const characters = catalogSection(ctx.catalogs, "playableCharacters");
    const selected = safeString(ctx.profile.selected_character_id, "");
    const character = characters[selected] || characters[DEFAULT_CHARACTER_ID] || firstObjectValue(characters) || null;
    const characterId = character?.id || DEFAULT_CHARACTER_ID;
    if (characterId && ctx.profile.selected_character_id !== characterId) {
      this.db.prepare("UPDATE player_profiles SET selected_character_id = ?, updated_at = ? WHERE id = ?")
        .run(characterId, now(), ctx.profile.id);
      ctx.profile.selected_character_id = characterId;
    }
    return character || { id: characterId, statBlockRef: "stat_block.player.desert", startingAbilityRefs: [], startingItemGrants: [], startingCurrencyGrants: [] };
  }

  ensureProgression(ctx) {
    const existing = this.db.prepare("SELECT level, xp FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id);
    if (!existing) {
      this.db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 1, 0, 0, 1, ?)")
        .run(ctx.profile.id, now());
      return;
    }
    // Fase 6: de XP-grafiek of het hoogste level kan veranderd zijn. De XP blijft; het level volgt de nieuwe lijn.
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const level = levelForXp(ctx.catalogs, progressionPolicy.xpCurveRef || "stat_curve.player_xp", existing.xp, progressionPolicy.maxLevel || 10);
    if (level !== safeInteger(existing.level, 1)) {
      this.db.prepare("UPDATE player_progression SET level = ?, revision = revision + 1, updated_at = ? WHERE player_id = ?").run(level, now(), ctx.profile.id);
    }
  }

  ensureStats(ctx, character) {
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const statBlockRef = character?.statBlockRef || progressionPolicy.baseStatBlockRef || "stat_block.player.desert";
    const level = Math.max(1, safeInteger(this.db.prepare("SELECT level FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id)?.level, 1));
    this.syncStatsForLevel(ctx.profile.id, ctx.catalogs, statBlockRef, level);
  }

  // Fase 6: de stats van een character horen bij zijn klasse en zijn level: basis + groei per level (earned_value).
  // Levens en mana houden hun stand (groeit het maximum, dan krijg je het verschil erbij); kracht, pantser en heal-kracht
  // staan altijd op hun maximum.
  syncStatsForLevel(playerId, catalogs, statBlockRef, level) {
    const baseStats = statBlockValues(catalogs, statBlockRef);
    const growth = statBlockGrowth(catalogs, statBlockRef);
    const steps = Math.max(1, safeInteger(level, 1)) - 1;
    const stamp = now();
    for (const [statId, baseValue] of Object.entries(baseStats)) {
      const earned = safeNumber(growth[statId], 0) * steps;
      const max = baseValue + earned;
      const existing = this.db.prepare("SELECT * FROM player_stats WHERE player_id = ? AND stat_id = ? LIMIT 1").get(playerId, statId);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, revision, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(playerId, statId, baseValue, earned, max, stamp);
        continue;
      }
      const oldMax = safeNumber(existing.base_value, 0) + safeNumber(existing.earned_value, 0);
      let current = existing.current_value;
      if (!POOL_STAT_IDS.has(statId)) current = max;
      else if (current !== null && current !== undefined) {
        const had = safeNumber(current, oldMax);
        current = clamp(had > 0 && max > oldMax ? had + (max - oldMax) : had, 0, max);
      }
      if (safeNumber(existing.base_value, 0) !== baseValue || safeNumber(existing.earned_value, 0) !== earned || current !== existing.current_value) {
        this.db.prepare(`
          UPDATE player_stats
          SET base_value = ?, earned_value = ?, current_value = ?, revision = revision + 1, updated_at = ?
          WHERE player_id = ? AND stat_id = ?
        `).run(baseValue, earned, current, stamp, playerId, statId);
      }
    }
  }

  // De klasse (stat-blok) van een character, ook als we alleen zijn id hebben (iemand die meevocht en nu een level stijgt).
  statBlockRefForPlayer(ctx, playerId) {
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const characters = catalogSection(ctx.catalogs, "playableCharacters");
    let classId = playerId === ctx.profile?.id ? safeString(ctx.profile.selected_character_id, "") : "";
    if (!classId) classId = safeString(this.db.prepare("SELECT selected_character_id FROM player_profiles WHERE id = ? LIMIT 1").get(playerId)?.selected_character_id, "");
    const character = characters[classId] || characters[DEFAULT_CHARACTER_ID] || firstObjectValue(characters) || null;
    return character?.statBlockRef || progressionPolicy.baseStatBlockRef || "stat_block.player.desert";
  }

  ensureStartingInventoryAndCurrencies(ctx, character) {
    const granted = [];
    for (const grant of Array.isArray(character?.startingCurrencyGrants) ? character.startingCurrencyGrants : []) {
      const currencyId = safeString(grant?.currencyRef, "");
      const amount = Math.max(0, safeInteger(grant?.amountMinor, 0));
      if (!currencyId || amount <= 0) continue;
      const existing = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
        .get(ctx.profile.id, currencyId);
      if (!existing) this.grantCurrency(ctx, currencyId, amount, "starting_character", "character");
    }
    for (const grant of Array.isArray(character?.startingItemGrants) ? character.startingItemGrants : []) {
      const itemId = safeString(grant?.itemRef, "");
      const amount = Math.max(1, safeInteger(grant?.amount, 1));
      if (!itemId || this.ownedItemCount(ctx.profile.id, itemId) > 0 || this.startingItemWasGranted(ctx.profile.id, itemId)) continue;
      this.grantItem(ctx, itemId, amount, "starting_character", "character");
      granted.push(itemId);
    }
    return granted;
  }

  startingItemWasGranted(playerId, itemId) {
    if (!playerId || !itemId) return false;
    const row = this.db.prepare(`
      SELECT id FROM economy_ledger
      WHERE player_id = ?
        AND asset_id = ?
        AND reason = 'starting_character'
        AND asset_kind IN ('item_stack', 'item_instance')
      LIMIT 1
    `).get(playerId, itemId);
    return Boolean(row);
  }

  // Alleen net gegeven start-spullen gaan meteen aan (een start-zwaard zit dus in de hand).
  // Gekochte of gevonden spullen blijven in de tas; daar kies je zelf Uitrusten.
  ensureStarterEquipment(ctx, startItemIds = []) {
    if (!startItemIds.length) return;
    const slots = catalogSection(ctx.catalogs, "equipmentSlots");
    const allItems = catalogSection(ctx.catalogs, "items");
    const items = Object.fromEntries(startItemIds.filter((id) => allItems[id]).map((id) => [id, allItems[id]]));
    const existingSlots = new Set(this.db.prepare("SELECT slot_id FROM player_equipment WHERE player_id = ?").all(ctx.profile.id).map(function (row) {
      return row.slot_id;
    }));
    for (const item of Object.values(items)) {
      const slotId = safeString(item?.equipmentSlotRef, "");
      if (!slotId || !slots[slotId] || existingSlots.has(slotId)) continue;
      const instance = this.db.prepare(`
        SELECT * FROM player_item_instances
        WHERE player_id = ? AND item_id = ? AND location_type = 'inventory'
        ORDER BY created_at ASC
        LIMIT 1
      `).get(ctx.profile.id, item.id);
      if (!instance) continue;
      const stamp = now();
      this.db.prepare("UPDATE player_item_instances SET location_type = 'equipment', location_ref = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(slotId, stamp, instance.id);
      this.db.prepare(`
        INSERT INTO player_equipment (player_id, slot_id, item_instance_id, equipped_at, revision)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(player_id, slot_id) DO NOTHING
      `).run(ctx.profile.id, slotId, instance.id, stamp);
      existingSlots.add(slotId);
    }
  }

  instanceFromStackForEquip(ctx, itemId, operationId) {
    const item = catalogSection(ctx.catalogs, "items")[itemId] || {};
    const slotId = safeString(item.equipmentSlotRef, "");
    if (!slotId || !catalogSection(ctx.catalogs, "equipmentSlots")[slotId]) return "";
    const stack = this.db.prepare("SELECT * FROM player_inventory_stacks WHERE player_id = ? AND item_id = ? AND quantity > 0 ORDER BY updated_at ASC LIMIT 1").get(ctx.profile.id, itemId);
    if (!stack) return "";
    const before = safeInteger(stack.quantity, 0);
    const stamp = now();
    if (before <= 1) this.db.prepare("DELETE FROM player_inventory_stacks WHERE player_id = ? AND item_id = ? AND bind_state = ?").run(ctx.profile.id, itemId, stack.bind_state);
    else this.db.prepare("UPDATE player_inventory_stacks SET quantity = quantity - 1, revision = revision + 1, updated_at = ? WHERE player_id = ? AND item_id = ? AND bind_state = ?").run(stamp, ctx.profile.id, itemId, stack.bind_state);
    this.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, -1, before, before - 1, "equip_split", "equip");
    const id = "item_instance_" + crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO player_item_instances (id, player_id, item_id, bind_state, quality, durability, max_durability, modifiers_json, location_type, location_ref, revision, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'inventory', NULL, 1, ?, ?)
    `).run(id, ctx.profile.id, itemId, stack.bind_state || DEFAULT_BIND_STATE, item.rarity || null, item.durabilityMax || null, item.durabilityMax || null, stamp, stamp);
    this.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, 1, 0, 1, "equip_split", "equip");
    return id;
  }

  // Fase 05 (F5-E2-T04): uitrusten via de bestaande (legacy) tabellen; dit is de enige schrijver.
  // Het oude item in hetzelfde slot gaat terug naar de tas. Zelfde operationId = zelfde uitkomst (runOperation).
  equipItem(ctx, payload, operationId) {
    let instanceId = safeString(payload.itemInstanceId || payload.item_instance_id, "");
    const fail = (status, message) => { const error = new Error(message); error.status = status; return error; };
    // Een uitrustingsstuk dat (nog) op een stapel ligt: haal er één af en maak er een los stuk van.
    if (!instanceId && payload.itemId) instanceId = this.instanceFromStackForEquip(ctx, safeString(payload.itemId, ""), operationId);
    const instance = this.db.prepare("SELECT * FROM player_item_instances WHERE id = ? AND player_id = ? LIMIT 1").get(instanceId, ctx.profile.id);
    if (!instance) throw fail(404, "Item niet gevonden in je tas.");
    if (instance.location_type !== "inventory") throw fail(409, "Dit item zit niet (meer) in je tas.");
    const item = catalogSection(ctx.catalogs, "items")[instance.item_id] || {};
    const slotId = safeString(item.equipmentSlotRef, "");
    if (!slotId || !catalogSection(ctx.catalogs, "equipmentSlots")[slotId]) throw fail(409, (item.displayName || instance.item_id) + " kun je niet dragen.");
    // Fase 6: uitrusting "vanaf level".
    const needLevel = Math.max(1, safeInteger(item.requiredLevel, 1));
    if (needLevel > 1 && this.levelOfPlayer(ctx.profile.id) < needLevel) {
      throw httpError(409, (item.displayName || instance.item_id) + " kun je pas dragen vanaf level " + needLevel + ".", "LEVEL_TOO_LOW");
    }
    const stamp = now();
    const current = this.db.prepare("SELECT * FROM player_equipment WHERE player_id = ? AND slot_id = ? LIMIT 1").get(ctx.profile.id, slotId);
    if (current) {
      this.db.prepare("UPDATE player_item_instances SET location_type = 'inventory', location_ref = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND player_id = ?")
        .run(stamp, current.item_instance_id, ctx.profile.id);
      this.db.prepare("UPDATE player_equipment SET item_instance_id = ?, equipped_at = ?, revision = revision + 1 WHERE player_id = ? AND slot_id = ?")
        .run(instance.id, stamp, ctx.profile.id, slotId);
    } else {
      this.db.prepare("INSERT INTO player_equipment (player_id, slot_id, item_instance_id, equipped_at, revision) VALUES (?, ?, ?, ?, 1)")
        .run(ctx.profile.id, slotId, instance.id, stamp);
    }
    this.db.prepare("UPDATE player_item_instances SET location_type = 'equipment', location_ref = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
      .run(slotId, stamp, instance.id);
    this.recordGameplayEvent(ctx, "item_equipped", "player", instance.id, { slotId, itemId: instance.item_id, replaced: current?.item_instance_id || null });
    return {
      action: "equip",
      message: (item.displayName || instance.item_id) + " aangedaan.",
      events: [{ type: "equipped", slotId, itemInstanceId: instance.id }],
      grants: []
    };
  }

  // Stap 4 (HUD): uitdoen. Het stuk gaat terug naar de tas; de bonus telt dan niet meer mee.
  unequipItem(ctx, payload) {
    const slotId = safeString(payload.slotId || payload.slot_id, "");
    const row = slotId ? this.db.prepare("SELECT * FROM player_equipment WHERE player_id = ? AND slot_id = ? LIMIT 1").get(ctx.profile.id, slotId) : null;
    if (!row) throw httpError(404, "Daar draag je niets.");
    const instance = this.db.prepare("SELECT * FROM player_item_instances WHERE id = ? AND player_id = ? LIMIT 1").get(row.item_instance_id, ctx.profile.id);
    const stamp = now();
    this.db.prepare("DELETE FROM player_equipment WHERE player_id = ? AND slot_id = ?").run(ctx.profile.id, slotId);
    if (instance) {
      this.db.prepare("UPDATE player_item_instances SET location_type = 'inventory', location_ref = NULL, revision = revision + 1, updated_at = ? WHERE id = ? AND player_id = ?")
        .run(stamp, instance.id, ctx.profile.id);
    }
    const itemId = instance?.item_id || null;
    this.recordGameplayEvent(ctx, "item_unequipped", "player", row.item_instance_id, { slotId, itemId });
    return {
      action: "unequip",
      message: (itemId ? displayForItem(ctx.catalogs, itemId) : "Item") + " uitgedaan.",
      events: [{ type: "unequipped", slotId, itemInstanceId: row.item_instance_id }],
      grants: []
    };
  }

  // Stap 4 (HUD) + Healing (2-11): eten of drinken. Meteen genezen en/of een tijdelijk effect (5 min meer kracht).
  // Het item gaat pas weg als er echt iets gebeurt; anders blijft het in je tas (een epic drankje raak je nooit zomaar kwijt).
  useItem(ctx, payload, operationId) {
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
    if (!item) throw httpError(404, "Item niet gevonden.");
    const name = displayForItem(ctx.catalogs, itemId);
    const heal = safeInteger(item.healAmount, 0);
    const effect = effectFromSource(item, name);
    // Quest Builder stap 4: een brief (of ander item) lezen start een quest. Het item blijft in je tas.
    if (heal <= 0 && !effect && this.questUseItem) {
      const read = this.questUseItem(ctx, itemId, operationId);
      if (read) return read;
    }
    if (heal <= 0 && !effect) throw httpError(409, name + " kun je niet gebruiken.");
    const nowMs = Date.now();
    const waitMs = itemReadyInMs(this.db, ctx.profile.id, itemId, nowMs);
    if (waitMs > 0) throw httpError(409, name + ": nog " + Math.ceil(waitMs / 1000) + " s wachten.");
    const stats = this.loadPlayerStats(ctx.profile.id);
    const max = effectiveMaxStat(stats.byId[HEALTH_STAT_ID], 0);
    const before = statValue(stats.byId, HEALTH_STAT_ID, max);
    const canHeal = heal > 0 && max > 0 && before < max;
    const rules = this.combatRules(ctx.project);
    const source = effect ? { sourceKind: "item", sourceId: itemId, effect } : null;
    const effectPlan = source ? planEffect(this.db, ctx.profile.id, source, nowMs, rules) : null;
    if (!canHeal && !effectPlan?.ok) throw httpError(409, effectPlan && !effectPlan.ok ? effectPlan.reason : "Je levens zijn al vol.");
    if (!this.removeInventoryItem(ctx, itemId, 1, "item_used", "inventory_hud", operationId)) throw httpError(404, "Je hebt geen " + name + ".");
    const parts = [];
    const events = [];
    if (canHeal) {
      const after = Math.min(max, before + heal);
      this.db.prepare("UPDATE player_stats SET current_value = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND stat_id = ?")
        .run(after, now(), ctx.profile.id, HEALTH_STAT_ID);
      this.recordLedger(operationId, ctx.profile.id, "stat", HEALTH_STAT_ID, after - before, before, after, "item_used", itemId);
      parts.push("+" + Math.round(after - before) + " levens");
      events.push({ type: "healed", itemId, amount: after - before });
    }
    if (effectPlan?.ok) {
      applyEffect(this.db, ctx.profile.id, source, nowMs, rules);
      parts.push(describeEffect(effect).join(", ") + " (" + Math.round(effect.durationMs / 60000 * 10) / 10 + " min)");
      events.push({ type: "effect", itemId, name: effect.name, durationMs: effect.durationMs });
    }
    const cooldownS = safeInteger(item.useCooldownS, 0);
    if (cooldownS > 0) setItemCooldown(this.db, ctx.profile.id, itemId, nowMs + cooldownS * 1000);
    return { action: "use", message: name + ": " + parts.join(", ") + ".", events, grants: [] };
  }

  // Stap 4 (HUD): weggooien uit de tas. Questitems en wat je draagt blijven altijd.
  destroyItem(ctx, payload, operationId) {
    const instanceId = safeString(payload.itemInstanceId || payload.item_instance_id, "");
    const stackId = safeString(payload.stackId || payload.stack_id, "");
    let itemId = safeString(payload.itemId || payload.item_id, "");
    let instance = null;
    let stack = null;
    if (instanceId) {
      instance = this.db.prepare("SELECT * FROM player_item_instances WHERE id = ? AND player_id = ? LIMIT 1").get(instanceId, ctx.profile.id);
      if (!instance || instance.location_type !== "inventory") throw httpError(404, "Item niet gevonden in je tas.");
      itemId = instance.item_id;
    } else if (stackId) {
      stack = this.db.prepare("SELECT * FROM player_inventory_stacks WHERE stack_id = ? AND player_id = ? AND quantity > 0 LIMIT 1").get(stackId, ctx.profile.id);
      if (!stack) throw httpError(404, "Stapel niet gevonden in je tas.");
      itemId = stack.item_id;
    }
    const item = catalogSection(ctx.catalogs, "items")[itemId] || {};
    const name = displayForItem(ctx.catalogs, itemId);
    if (item.questItem === true || item.category === "quest") throw httpError(409, "Een questitem kun je niet weggooien.");
    let removed = 0;
    if (instance) {
      this.db.prepare("UPDATE player_item_instances SET location_type = 'deleted', locked_by_operation_id = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
        .run(operationId, now(), instance.id);
      this.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, -1, 1, 0, "item_destroyed", "inventory_hud");
      removed = 1;
    } else if (stack) {
      const before = safeInteger(stack.quantity, 0);
      const take = Math.min(before, clamp(safeInteger(payload.amount || payload.quantity, 1), 1, 1000000));
      const after = before - take;
      this.db.prepare("UPDATE player_inventory_stacks SET quantity = ?, revision = revision + 1, updated_at = ? WHERE stack_id = ?")
        .run(after, now(), stack.stack_id);
      this.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, -take, before, after, "item_destroyed", "inventory_hud");
      removed = take;
    } else if (itemId) {
      removed = this.removeInventoryItem(ctx, itemId, clamp(safeInteger(payload.amount || payload.quantity, 1), 1, 1000000), "item_destroyed", "inventory_hud", operationId);
    }
    if (!removed) throw httpError(404, "Item niet gevonden in je tas.");
    return { action: "destroy", message: removed + "× " + name + " weggegooid.", events: [{ type: "destroyed", itemId, amount: removed }], grants: [] };
  }

  // Tas-selectie: alles wordt binnen dezelfde operation-transactie gevalideerd en verwijderd.
  // Bij één fout rolt de hele selectie terug; zo verdwijnt nooit ongemerkt maar een deel.
  destroyItems(ctx, payload, operationId) {
    const requested = Array.isArray(payload.items) ? payload.items : [];
    if (!requested.length) throw httpError(400, "Selecteer eerst spullen om weg te gooien.");
    if (requested.length > 250) throw httpError(400, "Selecteer hooguit 250 vakjes tegelijk.");
    const seenInstances = new Set();
    const seenStacks = new Set();
    const items = requested.map(function (entry) {
      const itemInstanceId = safeString(entry?.itemInstanceId || entry?.item_instance_id, "");
      const stackId = safeString(entry?.stackId || entry?.stack_id, "");
      const itemId = safeString(entry?.itemId || entry?.item_id, "");
      const amount = clamp(safeInteger(entry?.amount || entry?.quantity, 1), 1, 1000000);
      if (itemInstanceId) {
        if (seenInstances.has(itemInstanceId)) throw httpError(400, "Hetzelfde losse item staat dubbel in de selectie.");
        seenInstances.add(itemInstanceId);
        return { itemInstanceId, itemId };
      }
      if (stackId) {
        if (seenStacks.has(stackId)) throw httpError(400, "Dezelfde stapel staat dubbel in de selectie.");
        seenStacks.add(stackId);
        return { stackId, itemId, amount };
      }
      throw httpError(400, "De selectie bevat een ongeldig item.");
    });
    for (const entry of items) {
      let owned = null;
      if (entry.itemInstanceId) {
        owned = this.db.prepare("SELECT item_id FROM player_item_instances WHERE id = ? AND player_id = ? AND location_type = 'inventory' LIMIT 1")
          .get(entry.itemInstanceId, ctx.profile.id);
      } else {
        owned = this.db.prepare("SELECT item_id, quantity FROM player_inventory_stacks WHERE stack_id = ? AND player_id = ? AND quantity > 0 LIMIT 1")
          .get(entry.stackId, ctx.profile.id);
        if (owned && entry.amount > safeInteger(owned.quantity, 0)) throw httpError(409, "De geselecteerde stapel is intussen veranderd. Selecteer hem opnieuw.");
      }
      if (!owned) throw httpError(404, "Een geselecteerd item staat niet meer in je tas.");
      entry.itemId = owned.item_id;
      const item = catalogSection(ctx.catalogs, "items")[entry.itemId] || {};
      if (item.questItem === true || item.category === "quest") throw httpError(409, "Een questitem kun je niet weggooien.");
    }
    let removed = 0;
    const names = [];
    for (const entry of items) {
      const result = this.destroyItem(ctx, entry, operationId);
      removed += safeInteger(result.events?.[0]?.amount, 0);
      if (result.events?.[0]?.itemId) names.push(displayForItem(ctx.catalogs, result.events[0].itemId));
    }
    const uniqueNames = Array.from(new Set(names));
    return {
      action: "destroy_many",
      message: removed + (removed === 1 ? " item" : " items") + " weggegooid" + (uniqueNames.length === 1 ? ": " + uniqueNames[0] : "."),
      events: [{ type: "destroyed_many", amount: removed }],
      grants: []
    };
  }

  runtimeEntityIsAvailable(entity) {
    if (entity?.entityKind === "enemy") return entity.alive !== false && entity.status !== "dead";
    return entity?.available !== false && !["depleted", "claimed"].includes(String(entity?.status || ""));
  }

  syncRuntimeEntityCollider(entity) {
    if (!entity?.visualEntityId || !this.mmoService || typeof this.mmoService.setWorldEntityColliderEnabled !== "function") return;
    this.mmoService.setWorldEntityColliderEnabled(entity.visualEntityId, this.runtimeEntityIsAvailable(entity));
  }

  ownedItemCount(playerId, itemId) {
    const stack = this.db.prepare("SELECT COALESCE(SUM(quantity), 0) AS qty FROM player_inventory_stacks WHERE player_id = ? AND item_id = ?")
      .get(playerId, itemId);
    const instances = this.db.prepare("SELECT COUNT(*) AS count FROM player_item_instances WHERE player_id = ? AND item_id = ? AND location_type != 'deleted'")
      .get(playerId, itemId);
    return safeInteger(stack?.qty, 0) + safeInteger(instances?.count, 0);
  }

  ensureZoneEntityState(ctx) {
    const desired = this.desiredEntityStates(ctx);
    const existingRows = this.db.prepare(`
      SELECT * FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id LIKE ?
    `).all(ctx.worldId, ctx.zoneId, NODE03_INSTANCE_PREFIX + "%");
    const existingIds = new Set(existingRows.map(function (row) { return row.instance_id; }));
    const desiredIds = new Set(desired.map(function (entity) { return entity.instanceId; }));
    const stamp = now();

    for (const row of existingRows) {
      if (!desiredIds.has(row.instance_id)) {
        this.db.prepare("DELETE FROM world_entity_state WHERE world_id = ? AND zone_id = ? AND instance_id = ?")
          .run(ctx.worldId, ctx.zoneId, row.instance_id);
      }
    }

    for (const entity of desired) {
      if (!existingIds.has(entity.instanceId)) {
        this.db.prepare(`
          INSERT INTO world_entity_state (world_id, zone_id, instance_id, state_kind, state_json, revision, updated_at)
          VALUES (?, ?, ?, 'node03_runtime', ?, 1, ?)
        `).run(ctx.worldId, ctx.zoneId, entity.instanceId, stableJson(entity), stamp);
        this.syncRuntimeEntityCollider(entity);
        continue;
      }
      const row = existingRows.find(function (candidate) { return candidate.instance_id === entity.instanceId; });
      const current = safeJsonParse(row?.state_json, {}) || {};
      const merged = this.mergeEntityRuntimeState(ctx, current, entity);
      const nextJson = stableJson(merged);
      if (nextJson !== row.state_json) {
        this.db.prepare(`
          UPDATE world_entity_state
          SET state_json = ?, revision = revision + 1, updated_at = ?
          WHERE world_id = ? AND zone_id = ? AND instance_id = ?
        `).run(nextJson, stamp, ctx.worldId, ctx.zoneId, entity.instanceId);
      }
      this.syncRuntimeEntityCollider(merged);
    }
  }

  desiredEntityStates(ctx) {
    const result = [];
    const controllers = Array.isArray(ctx.zonePackage?.spawnControllers) ? ctx.zonePackage.spawnControllers : [];
    for (const controller of controllers) {
      const spawnSets = Array.isArray(controller?.spawnSets) ? controller.spawnSets : [];
      for (const spawnSet of spawnSets) {
        const spawns = Array.isArray(spawnSet?.spawns) ? spawnSet.spawns : [];
        for (const spawn of spawns) {
          result.push.apply(result, this.desiredStatesForSpawn(ctx, controller, spawnSet, spawn));
        }
      }
    }
    for (const entity of Array.isArray(ctx.zonePackage?.entities) ? ctx.zonePackage.entities : []) {
      result.push.apply(result, this.desiredStatesForAuthoredEntity(ctx, entity));
    }
    return result;
  }

  desiredStatesForAuthoredEntity(ctx, entity) {
    if (!entity || entity.nodeType !== "entity_assembly" || entity.model?.nodeType !== "model_entity") return [];
    const model = entity.model;
    const components = Array.isArray(entity.components) ? entity.components : [];
    const authoredId = safeString(entity.entityId || model.entityId || model.nodeId || entity.nodeId, "authored_entity");
    const base = {
      x: safeNumber(model.x, 0),
      y: safeNumber(model.y, 0),
      z: safeNumber(model.z, 0),
      visualEntityId: model.nodeId || model.entityId || null,
      authoredEntityId: authoredId,
      modelAssetId: null,
      renderBody: false,
      modelScaleX: safeNumber(model.scaleX, 1),
      modelScaleY: safeNumber(model.scaleY, 1),
      modelScaleZ: safeNumber(model.scaleZ, 1),
      modelRotationX: safeNumber(model.rotationX, 0),
      modelRotationY: safeNumber(model.rotationY, 0),
      modelRotationZ: safeNumber(model.rotationZ, 0)
    };
    const states = [];
    const enemyComponent = components.find(function (component) { return component?.nodeType === "enemy_component"; });
    if (enemyComponent) {
      const spawn = Object.assign({}, enemyComponent, {
        nodeType: "enemy_component",
        spawnEntryId: enemyComponent.componentId || entity.nodeId,
        x: base.x,
        y: base.y,
        z: base.z,
        radius: 0,
        countMin: 1,
        countMax: 1,
        maxAlive: 1
      });
      const desired = this.desiredEnemiesForSpawn(ctx, {}, {}, spawn)[0];
      if (desired) {
        const definition = catalogSection(ctx.catalogs, "enemies")[enemyComponent.enemyRef] || {};
        const variant = catalogSection(ctx.catalogs, "variants")[enemyComponent.variantRef] || {};
        const stats = applyStatMultipliers(statBlockValues(ctx.catalogs, definition.statBlockRef || ""), variant);
        const healthMax = healthFromStats(stats);
        states.push(Object.assign({}, desired, base, {
          instanceId: NODE03_INSTANCE_PREFIX + ctx.zoneId + ":authored:" + safeEntityReferenceId(authoredId) + ":enemy",
          spawnEntryId: null,
          enemyRef: enemyComponent.enemyRef || definition.id || null,
          displayName: safeString(entity.label || model.label || definition.displayName, "Enemy"),
          stats,
          healthMax,
          healthCurrent: healthMax,
          lootTableRef: enemyComponent.lootOverrideRef || definition.lootTableRef || null,
          respawnPolicyRef: enemyComponent.respawnOverrideRef || definition.defaultRespawnPolicyRef || "respawn_policy.node03_quick"
        }));
      }
    }
    const resourceComponent = components.find(function (component) { return component?.nodeType === "resource_component"; });
    if (resourceComponent) {
      const spawn = Object.assign({}, resourceComponent, {
        nodeType: "resource_component",
        spawnEntryId: resourceComponent.componentId || entity.nodeId,
        x: base.x,
        y: base.y,
        z: base.z,
        radius: 0,
        count: 1
      });
      const desired = this.desiredResourcesForSpawn(ctx, {}, {}, spawn)[0];
      if (desired) {
        const definition = catalogSection(ctx.catalogs, "resources")[resourceComponent.resourceRef] || {};
        states.push(Object.assign({}, desired, base, {
          instanceId: NODE03_INSTANCE_PREFIX + ctx.zoneId + ":authored:" + safeEntityReferenceId(authoredId) + ":resource",
          spawnEntryId: null,
          resourceRef: resourceComponent.resourceRef || definition.id || null,
          displayName: safeString(entity.label || model.label || definition.displayName, "Resource"),
          lootTableRef: definition.yieldLootTableRef || null,
          yieldItemRefs: Array.isArray(definition.yieldItemRefs) ? definition.yieldItemRefs : [],
          yieldMultiplier: Math.max(0, safeNumber(resourceComponent.yieldMultiplier, 1)),
          requiredAbilityRef: definition.requiredAbilityRef || null,
          respawnPolicyRef: resourceComponent.respawnPolicyOverrideRef || definition.respawnPolicyRef || "respawn_policy.node03_quick"
        }));
      }
    }
    const pickupComponent = components.find(function (component) { return component?.nodeType === "pickup_component"; });
    if (pickupComponent) {
      const spawn = Object.assign({}, pickupComponent, {
        nodeType: "pickup_component",
        spawnEntryId: pickupComponent.componentId || entity.nodeId,
        pickupKind: "item",
        x: base.x,
        y: base.y,
        z: base.z,
        minAmount: pickupComponent.amount,
        maxAmount: pickupComponent.amount
      });
      const desired = this.desiredPickupForSpawn(ctx, {}, {}, spawn);
      const definition = catalogSection(ctx.catalogs, "items")[pickupComponent.itemRef] || {};
      states.push(Object.assign({}, desired, base, {
        instanceId: NODE03_INSTANCE_PREFIX + ctx.zoneId + ":authored:" + safeEntityReferenceId(authoredId) + ":pickup",
        spawnEntryId: null,
        itemRef: pickupComponent.itemRef || definition.id || null,
        definitionId: pickupComponent.itemRef || definition.id || null,
        displayName: safeString(entity.label || model.label || definition.displayName, "Item"),
        amount: Math.max(1, safeInteger(pickupComponent.amount, 1)),
        minAmount: Math.max(1, safeInteger(pickupComponent.amount, 1)),
        maxAmount: Math.max(1, safeInteger(pickupComponent.amount, 1)),
        respawnPolicyRef: pickupComponent.respawnPolicyRef || "respawn_policy.node03_quick",
        interaction: {
          action: "pickup",
          prompt: safeString(pickupComponent.interactionPrompt, "Pick up"),
          range: Math.max(0.1, safeNumber(pickupComponent.range, 3))
        }
      }));
    }
    return states;
  }

  desiredStatesForSpawn(ctx, controller, spawnSet, spawn) {
    if (!spawn || !spawn.nodeType) return [];
    if (spawn.nodeType === "enemy_spawn_area") return this.desiredEnemiesForSpawn(ctx, controller, spawnSet, spawn);
    if (spawn.nodeType === "resource_spawn") return this.desiredResourcesForSpawn(ctx, controller, spawnSet, spawn);
    if (spawn.nodeType === "pickup_spawn") return [this.desiredPickupForSpawn(ctx, controller, spawnSet, spawn)];
    return [];
  }

  desiredEnemiesForSpawn(ctx, controller, spawnSet, spawn) {
    const count = clamp(safeInteger(spawn.countMax || spawn.countMin || spawn.maxAlive, 1), 1, 12);
    const enemy = catalogSection(ctx.catalogs, "enemies")[spawn.enemyRef] || {};
    const variant = catalogSection(ctx.catalogs, "variants")[spawn.variantRef] || {};
    const stats = applyStatMultipliers(statBlockValues(ctx.catalogs, enemy.statBlockRef || "stat_block.enemy.sand_raider"), variant);
    const healthMax = healthFromStats(stats);
    const displayName = safeString(variant.displayNameOverride || enemy.displayName, "Enemy");
    const modelAssetId = variant.modelAssetOverride || enemy.modelAssetId || enemy.worldModelAssetId || null;
    const modelScale = safeNumber(enemy.scale, 1) * safeNumber(variant.scaleMultiplier, 1);
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const offset = spawnOffset(index, count, safeNumber(spawn.radius, 0));
      const instanceId = NODE03_INSTANCE_PREFIX + ctx.zoneId + ":" + safeString(spawn.spawnEntryId || spawn.nodeId, "enemy_spawn") + ":enemy:" + (index + 1);
      result.push({
        version: 1,
        instanceId,
        zoneId: ctx.zoneId,
        entityKind: "enemy",
        targetKind: "enemy",
        nodeType: spawn.nodeType,
        spawnEntryId: spawn.spawnEntryId || spawn.nodeId,
        spawnSetId: spawnSet.spawnSetId || spawnSet.nodeId || null,
        spawnControllerId: controller.spawnControllerId || controller.nodeId || null,
        enemyRef: spawn.enemyRef || enemy.id || null,
        variantRef: spawn.variantRef || null,
        difficultyRef: spawn.difficultyRef || null,
        displayName,
        visualEntityId: safeEntityReferenceId(instanceId),
        modelAssetId,
        modelScale,
        level: Math.max(1, safeInteger(spawn.fixedLevel, 1)),
        x: round(safeNumber(spawn.x, 0) + offset.x),
        y: round(safeNumber(spawn.y, 0)),
        z: round(safeNumber(spawn.z, 0) + offset.z),
        radius: safeNumber(spawn.collisionRadius || 0.8, 0.8),
        stats,
        healthMax,
        healthCurrent: healthMax,
        alive: true,
        status: "alive",
        lootTableRef: spawn.lootOverrideRef || enemy.lootTableRef || "loot_table.sand_raider",
        respawnPolicyRef: spawn.respawnPolicyRef || enemy.respawnPolicyRef || "respawn_policy.node03_quick",
        interaction: { action: "attack", prompt: "Attack", range: 2.8 },
        updatedAt: now()
      });
    }
    return result;
  }

  desiredResourcesForSpawn(ctx, controller, spawnSet, spawn) {
    const count = clamp(safeInteger(spawn.count, 1), 1, 24);
    const resource = catalogSection(ctx.catalogs, "resources")[spawn.resourceRef] || {};
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const offset = spawnOffset(index, count, safeNumber(spawn.radius, 0));
      const instanceId = NODE03_INSTANCE_PREFIX + ctx.zoneId + ":" + safeString(spawn.spawnEntryId || spawn.nodeId, "resource_spawn") + ":resource:" + (index + 1);
      result.push({
        version: 1,
        instanceId,
        zoneId: ctx.zoneId,
        entityKind: "resource",
        targetKind: "resource",
        nodeType: spawn.nodeType,
        spawnEntryId: spawn.spawnEntryId || spawn.nodeId,
        spawnSetId: spawnSet.spawnSetId || spawnSet.nodeId || null,
        spawnControllerId: controller.spawnControllerId || controller.nodeId || null,
        resourceRef: spawn.resourceRef || resource.id || null,
        displayName: safeString(resource.displayName, "Resource"),
        visualEntityId: safeEntityReferenceId(instanceId),
        modelAssetId: resource.worldModelAssetId || null,
        modelScale: safeNumber(resource.worldModelScale || spawn.worldModelScale, 0.45),
        x: round(safeNumber(spawn.x, 0) + offset.x),
        y: round(safeNumber(spawn.y, 0)),
        z: round(safeNumber(spawn.z, 0) + offset.z),
        radius: 1.5,
        available: true,
        status: "available",
        lootTableRef: resource.yieldLootTableRef || "loot_table.sun_crystal",
        respawnPolicyRef: spawn.respawnOverrideRef || resource.respawnPolicyRef || "respawn_policy.node03_quick",
        requiredAbilityRef: resource.requiredAbilityRef || "ability.gather_sun_crystal",
        interaction: { action: "gather", prompt: "Gather", range: safeNumber(resource.range, 3) || 3 },
        updatedAt: now()
      });
    }
    return result;
  }

  desiredPickupForSpawn(ctx, controller, spawnSet, spawn) {
    const kind = safeString(spawn.pickupKind, "item");
    const instanceId = NODE03_INSTANCE_PREFIX + ctx.zoneId + ":" + safeString(spawn.spawnEntryId || spawn.nodeId, "pickup_spawn") + ":pickup";
    const definitionId = kind === "currency" ? safeString(spawn.currencyRef, "") : safeString(spawn.itemRef, "");
    const item = kind === "item" ? (catalogSection(ctx.catalogs, "items")[definitionId] || {}) : {};
    const state = {
      version: 1,
      instanceId,
      zoneId: ctx.zoneId,
      entityKind: "pickup",
      targetKind: "pickup",
      nodeType: spawn.nodeType,
      spawnEntryId: spawn.spawnEntryId || spawn.nodeId,
      spawnSetId: spawnSet.spawnSetId || spawnSet.nodeId || null,
      spawnControllerId: controller.spawnControllerId || controller.nodeId || null,
      pickupKind: kind,
      itemRef: kind === "item" ? definitionId : null,
      currencyRef: kind === "currency" ? definitionId : null,
      definitionId,
      displayName: kind === "currency" ? displayForCurrency(ctx.catalogs, definitionId) : displayForItem(ctx.catalogs, definitionId),
      visualEntityId: safeEntityReferenceId(instanceId),
      modelAssetId: item.worldModelAssetId || null,
      modelScale: safeNumber(item.worldModelScale || spawn.worldModelScale, 0.45),
      amount: Math.max(1, safeInteger(spawn.amount || spawn.minAmount, 1)),
      minAmount: Math.max(1, safeInteger(spawn.minAmount || spawn.amount, 1)),
      maxAmount: Math.max(1, safeInteger(spawn.maxAmount || spawn.amount, 1)),
      x: round(safeNumber(spawn.x, 0)),
      y: round(safeNumber(spawn.y, 0)),
      z: round(safeNumber(spawn.z, 0)),
      radius: 1.2,
      available: true,
      status: "available",
      respawnPolicyRef: spawn.respawnPolicyRef || "respawn_policy.node03_quick",
      // Quest Builder stap 4: shared = één voor iedereen; personal = ieder zijn eigen; once = ieder 1×.
      claimMode: spawn.claimMode === "personal" || spawn.claimMode === "once" ? spawn.claimMode : "shared",
      interaction: { action: "pickup", prompt: "Pick up", range: 3 },
      updatedAt: now()
    };
    // 9-11: draaien en kantelen per pickup. null (niet weglaten) zodat terugdraaien naar 0 ook de opgeslagen stand overschrijft.
    state.modelRotationX = safeNumber(spawn.rotationX, 0) || null;
    state.modelRotationY = safeNumber(spawn.rotationY, 0) || null;
    state.modelRotationZ = safeNumber(spawn.rotationZ, 0) || null;
    return state;
  }

  mergeEntityRuntimeState(ctx, current, desired) {
    if (current.entityKind !== desired.entityKind) return desired;
    const merged = Object.assign({}, current, desired, {
      updatedAt: current.updatedAt || desired.updatedAt
    });
    if (desired.entityKind === "enemy") {
      const wasAlive = current.alive !== false && current.status !== "dead";
      const currentRespawnTime = Date.parse(current.respawnAt || "");
      merged.alive = wasAlive;
      merged.status = wasAlive ? "alive" : "dead";
      merged.healthMax = desired.healthMax;
      merged.healthCurrent = wasAlive ? clamp(safeNumber(current.healthCurrent, desired.healthMax), 0, desired.healthMax) : 0;
      if (!merged.respawnPolicyRef) merged.respawnAt = null;
      if (!wasAlive && merged.respawnPolicyRef && !Number.isFinite(currentRespawnTime)) {
        merged.respawnAt = addMs(this.respawnDelay(ctx, merged.respawnPolicyRef));
      }
      if (!wasAlive && merged.respawnPolicyRef && Number.isFinite(currentRespawnTime) && currentRespawnTime <= Date.now()) {
        merged.alive = true;
        merged.status = "alive";
        merged.healthCurrent = desired.healthMax;
        merged.respawnAt = null;
        merged.defeatedBy = null;
      }
    } else {
      const available = current.available !== false && !["depleted", "claimed"].includes(current.status);
      const currentRespawnTime = Date.parse(current.respawnAt || "");
      merged.available = available;
      merged.status = available ? "available" : current.status;
      if (!merged.respawnPolicyRef) merged.respawnAt = null;
      if (!available && merged.respawnPolicyRef && !Number.isFinite(currentRespawnTime)) {
        merged.respawnAt = addMs(this.respawnDelay(ctx, merged.respawnPolicyRef));
      }
      if (!available && merged.respawnPolicyRef && Number.isFinite(currentRespawnTime) && currentRespawnTime <= Date.now()) {
        merged.available = true;
        merged.status = "available";
        merged.respawnAt = null;
        merged.claimedBy = null;
        merged.depletedBy = null;
      }
    }
    return merged;
  }

  performAction(ctx, action, payload, operationId) {
    if (action === "respawn") return this.respawnPlayer(ctx, operationId);
    if (action === "reset_demo" || action === "reset") return this.resetDemo(ctx, operationId);
    if (action === "debug_inventory_add" || action === "inventory_add") return this.debugAdjustInventory(ctx, payload, operationId, 1);
    if (action === "debug_inventory_remove" || action === "inventory_remove") return this.debugAdjustInventory(ctx, payload, operationId, -1);
    if (action === "debug_inventory_cleanup" || action === "inventory_cleanup") return this.debugCleanupInventory(ctx, operationId);
    if (action === "debug_level_reset" || action === "level_reset") return this.debugResetLevel(ctx, operationId);
    if (action === "debug_currency_add" || action === "currency_add") return this.debugAdjustCurrency(ctx, payload, operationId, 1);
    if (action === "debug_currency_remove" || action === "currency_remove") return this.debugAdjustCurrency(ctx, payload, operationId, -1);
    // Fase 5: maker-gereedschap (alleen een admin-account): level zetten en XP geven.
    if (action === "maker_level") return this.makerSetLevel(ctx, payload, operationId);
    if (action === "maker_xp") return this.makerGiveXp(ctx, payload, operationId);
    if (action === "loadout_set") return this.setLoadoutSlot(ctx, payload);
    if (this.isPlayerDead(ctx)) {
      const error = new Error("Je speler is verslagen. Gebruik Respawn om verder te spelen.");
      error.status = 409;
      throw error;
    }
    if (action === "unstuck") return this.unstuckPlayer(ctx);
    if (action === "portal_unlock") return this.portalUnlock(ctx, payload.targetId);
    if (action === "portal_travel") return this.portalTravel(ctx, payload.targetId);
    if (action === "portal_travel_mate") return this.portalTravelToMate(ctx, payload.targetId);
    if (action === "attack") return this.attackTarget(ctx, payload.targetId, operationId);
    if (action === "gather") return this.gatherTarget(ctx, payload.targetId, operationId);
    if (action === "pickup") return this.pickupTarget(ctx, payload.targetId, operationId);
    if (action === "equip") return this.equipItem(ctx, payload, operationId);
    if (action === "unequip") return this.unequipItem(ctx, payload);
    if (action === "use") return this.useItem(ctx, payload, operationId);
    if (action === "heal") return this.healTarget(ctx, payload, operationId);
    if (action === "skill") return this.useSkill(ctx, payload, operationId);
    if (action === "destroy") return this.destroyItem(ctx, payload, operationId);
    if (action === "destroy_many") return this.destroyItems(ctx, payload, operationId);
    // Fase 8 herstel 2: het buitvenster (één ding pakken of alles).
    if (action === "loot_take") return this.takeLoot(ctx, payload, operationId, false);
    if (action === "loot_take_all") return this.takeLoot(ctx, payload, operationId, true);
    const error = new Error("Onbekende spelactie: " + (action || "-"));
    error.status = 400;
    throw error;
  }

  debugAdjustInventory(ctx, payload, operationId, direction) {
    const itemId = safeString(payload.itemId || payload.item_id, "");
    const amount = Math.max(1, safeInteger(payload.amount || payload.quantity, 1));
    const item = catalogSection(ctx.catalogs, "items")[itemId] || null;
    if (!item) {
      const error = new Error("Item niet gevonden: " + (itemId || "-"));
      error.status = 404;
      throw error;
    }
    if (direction > 0) {
      const grants = this.grantItem(ctx, itemId, amount, "hud_debug_add", "inventory_hud", operationId);
      return { action: "debug_inventory_add", grants, message: "+" + amount + " " + displayForItem(ctx.catalogs, itemId) };
    }
    const removed = this.removeInventoryItem(ctx, itemId, amount, "hud_debug_remove", "inventory_hud", operationId);
    return { action: "debug_inventory_remove", removed, message: "-" + removed + " " + displayForItem(ctx.catalogs, itemId) };
  }

  debugCleanupInventory(ctx, operationId) {
    const stamp = now();
    const stacks = this.db.prepare(`
      SELECT * FROM player_inventory_stacks
      WHERE player_id = ? AND quantity > 0
      ORDER BY updated_at ASC
    `).all(ctx.profile.id);
    let removedStackCount = 0;
    let removedStackQuantity = 0;
    for (const stack of stacks) {
      const before = safeInteger(stack.quantity, 0);
      if (before <= 0) continue;
      this.db.prepare(`
        UPDATE player_inventory_stacks
        SET quantity = 0, revision = revision + 1, updated_at = ?
        WHERE stack_id = ?
      `).run(stamp, stack.stack_id);
      this.recordLedger(operationId, ctx.profile.id, "item_stack", stack.item_id, -before, before, 0, "hud_debug_inventory_cleanup", "debug_hud");
      removedStackCount += 1;
      removedStackQuantity += before;
    }

    const instances = this.db.prepare(`
      SELECT * FROM player_item_instances
      WHERE player_id = ? AND location_type = 'inventory'
      ORDER BY updated_at ASC
    `).all(ctx.profile.id);
    for (const instance of instances) {
      this.db.prepare(`
        UPDATE player_item_instances
        SET location_type = 'deleted', location_ref = NULL, locked_by_operation_id = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(operationId, stamp, instance.id);
      this.recordLedger(operationId, ctx.profile.id, "item_instance", instance.item_id, -1, 1, 0, "hud_debug_inventory_cleanup", "debug_hud");
    }

    const gold = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(ctx.profile.id, GOLD_CURRENCY_ID);
    const removedGold = Math.max(0, safeInteger(gold?.amount_minor, 0));
    if (removedGold > 0) {
      this.db.prepare(`
        UPDATE player_currencies
        SET amount_minor = 0, revision = revision + 1, updated_at = ?
        WHERE player_id = ? AND currency_id = ?
      `).run(stamp, ctx.profile.id, GOLD_CURRENCY_ID);
      this.recordLedger(operationId, ctx.profile.id, "currency", GOLD_CURRENCY_ID, -removedGold, removedGold, 0, "hud_debug_inventory_cleanup", "debug_hud");
    }

    const removedItemCount = removedStackQuantity + instances.length;
    return {
      action: "debug_inventory_cleanup",
      removedStackCount,
      removedInstanceCount: instances.length,
      removedItemCount,
      removedGold,
      message: removedItemCount > 0 || removedGold > 0
        ? "Inventory leeggemaakt: " + removedItemCount + " item(s), " + removedGold + " gold."
        : "Inventory en gold waren al leeg."
    };
  }

  debugResetLevel(ctx, operationId) {
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id) || {};
    const beforeLevel = Math.max(1, safeInteger(row.level, 1));
    const beforeXp = Math.max(0, safeInteger(row.xp, 0));
    const beforeSkillPoints = Math.max(0, safeInteger(row.skill_points, 0));
    this.db.prepare(`
      UPDATE player_progression
      SET level = 1, xp = 0, skill_points = 0, revision = revision + 1, updated_at = ?
      WHERE player_id = ?
    `).run(now(), ctx.profile.id);
    if (beforeLevel !== 1) this.levelChanged(ctx, ctx.profile.id, beforeLevel, 1);
    if (beforeXp > 0) {
      this.recordLedger(operationId, ctx.profile.id, "xp", "xp", -beforeXp, beforeXp, 0, "hud_debug_level_reset", "debug_hud");
    }
    return {
      action: "debug_level_reset",
      beforeLevel,
      beforeXp,
      beforeSkillPoints,
      level: 1,
      xp: 0,
      skillPoints: 0,
      message: beforeLevel > 1 || beforeXp > 0 || beforeSkillPoints > 0
        ? "Level gereset naar 1."
        : "Level stond al op 1."
    };
  }

  debugAdjustCurrency(ctx, payload, operationId, direction) {
    const currencyId = safeString(payload.currencyId || payload.currency_id, "");
    const amount = Math.max(1, safeInteger(payload.amount || payload.amountMinor || payload.quantity, 1));
    const currency = catalogSection(ctx.catalogs, "currencies")[currencyId] || null;
    if (!currency) {
      const error = new Error("Currency niet gevonden: " + (currencyId || "-"));
      error.status = 404;
      throw error;
    }
    if (direction > 0) {
      const grant = this.grantCurrency(ctx, currencyId, amount, "hud_debug_add", "wallet_hud", operationId);
      return { action: "debug_currency_add", grants: [grant].filter(Boolean), message: "+" + amount + " " + displayForCurrency(ctx.catalogs, currencyId) };
    }
    const removed = this.removeCurrency(ctx, currencyId, amount, "hud_debug_remove", "wallet_hud", operationId);
    return { action: "debug_currency_remove", removed, message: "-" + removed + " " + displayForCurrency(ctx.catalogs, currencyId) };
  }

  isPlayerDead(ctx) {
    const row = this.db.prepare("SELECT current_value FROM player_stats WHERE player_id = ? AND stat_id = ? LIMIT 1")
      .get(ctx.profile.id, HEALTH_STAT_ID);
    return row && safeNumber(row.current_value, 0) <= 0;
  }

  getEntityState(ctx, instanceId) {
    const entityCtx = this.entityContextForInstance(ctx, instanceId);
    const row = this.db.prepare(`
      SELECT * FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id = ?
      LIMIT 1
    `).get(entityCtx.worldId, entityCtx.zoneId, instanceId);
    if (!row) return null;
    const state = safeJsonParse(row.state_json, {}) || {};
    return { row, zoneId: entityCtx.zoneId, state: Object.assign({ zoneId: entityCtx.zoneId }, state) };
  }

  saveEntityState(ctx, entity) {
    const zoneId = safeString(entity?.zoneId || node03InstanceZoneId(entity?.instanceId), ctx.zoneId);
    this.db.prepare(`
      UPDATE world_entity_state
      SET state_json = ?, revision = revision + 1, updated_at = ?
      WHERE world_id = ? AND zone_id = ? AND instance_id = ?
    `).run(stableJson(entity), now(), ctx.worldId, zoneId, entity.instanceId);
    this.syncRuntimeEntityCollider(entity);
  }

  assertInRange(ctx, entity, action) {
    const config = interactionHudConfig(ctx.project) || {};
    const rangeMode = safeString(config.rangeMode, "ability_range");
    if (rangeMode === "unrestricted") return;
    const distance = positionDistance(ctx.position, entity);
    const range = this.actionRange(ctx, action, entity);
    if (distance !== null && distance <= range + safeNumber(entity.radius, 0)) return;
    const error = new Error("Target is te ver weg voor " + action + ".");
    error.status = 400;
    error.details = { distance: distance === null ? null : round(distance), range };
    throw error;
  }

  actionRange(ctx, action, entity) {
    if (action === "attack") {
      const ability = catalogSection(ctx.catalogs, "abilities")["ability.basic_attack"] || {};
      return safeNumber(ability.range, 2.8);
    }
    if (action === "gather") {
      const ability = catalogSection(ctx.catalogs, "abilities")[entity.requiredAbilityRef] || {};
      return safeNumber(ability.range, 3);
    }
    return safeNumber(entity?.interaction?.range, 3);
  }

  attackTarget(ctx, targetId, operationId) {
    if (isActorInstanceId(targetId)) return this.attackActor(ctx, safeString(targetId, ""), operationId);
    const target = this.getEntityState(ctx, safeString(targetId, ""));
    if (!target || target.state.entityKind !== "enemy") {
      const error = new Error("Enemy target niet gevonden.");
      error.status = 404;
      throw error;
    }
    const enemy = target.state;
    if (enemy.alive === false || enemy.status === "dead") {
      return { action: "attack", targetId: enemy.instanceId, message: enemy.displayName + " is al verslagen.", events: [] };
    }
    this.assertInRange(ctx, enemy, "attack");
    const stats = this.loadPlayerStats(ctx.profile.id);
    const attackPower = statValue(stats.byId, ATTACK_POWER_STAT_ID, 10);
    const ability = catalogSection(ctx.catalogs, "abilities")["ability.basic_attack"] || {};
    const baseDamage = formulaValue(ability.damageFormula, 16);
    const armor = safeNumber(enemy.stats?.[ARMOR_STAT_ID], 0);
    const damage = Math.max(1, Math.round(baseDamage + attackPower * 0.5 - armor * 0.35));
    enemy.healthCurrent = Math.max(0, safeNumber(enemy.healthCurrent, enemy.healthMax) - damage);
    enemy.updatedAt = now();

    const events = [{ type: "damage", amount: damage, targetId: enemy.instanceId, label: enemy.displayName }];
    let grants = [];
    if (enemy.healthCurrent <= 0) {
      enemy.alive = false;
      enemy.status = "dead";
      enemy.defeatedBy = ctx.profile.id;
      enemy.respawnAt = enemy.respawnPolicyRef ? addMs(this.respawnDelay(ctx, enemy.respawnPolicyRef)) : null;
      grants = grants.concat(this.grantLootTable(ctx, enemy.lootTableRef, operationId, enemy.instanceId, "enemy_defeated"));
      const xpGrant = this.grantXpForEnemy(ctx, enemy, operationId);
      if (xpGrant) grants.push(xpGrant);
      events.push({ type: "defeated", targetId: enemy.instanceId, label: enemy.displayName });
      this.recordGameplayEvent(ctx, "enemy_defeated", "player", enemy.instanceId, { damage, grants });
    } else {
      const retaliation = this.applyEnemyRetaliation(ctx, enemy, operationId);
      if (retaliation) events.push(retaliation);
      this.recordGameplayEvent(ctx, "enemy_hit", "player", enemy.instanceId, { damage, healthCurrent: enemy.healthCurrent });
    }
    this.saveEntityState(ctx, enemy);
    return {
      action: "attack",
      targetId: enemy.instanceId,
      message: enemy.status === "dead" ? enemy.displayName + " defeated." : enemy.displayName + " hit for " + damage + ".",
      events,
      grants
    };
  }

  applyEnemyRetaliation(ctx, enemy, operationId) {
    const stats = this.loadPlayerStats(ctx.profile.id);
    const health = stats.byId[HEALTH_STAT_ID];
    if (!health) return null;
    const enemyAttack = safeNumber(enemy.stats?.[ATTACK_POWER_STAT_ID], 8);
    const playerArmor = statValue(stats.byId, ARMOR_STAT_ID, 0);
    const damage = Math.max(1, Math.round(8 + enemyAttack * 0.35 - playerArmor * 0.25));
    const before = statValue(stats.byId, HEALTH_STAT_ID, 1);
    const after = Math.max(0, before - damage);
    this.db.prepare(`
      UPDATE player_stats
      SET current_value = ?, revision = revision + 1, updated_at = ?
      WHERE player_id = ? AND stat_id = ?
    `).run(after, now(), ctx.profile.id, HEALTH_STAT_ID);
    this.recordLedger(operationId, ctx.profile.id, "stat", HEALTH_STAT_ID, -damage, before, after, "enemy_retaliation", enemy.instanceId);
    if (after <= 0) {
      this.recordGameplayEvent(ctx, "player_defeated", enemy.instanceId, "player", { damage });
      if (this.mmoService && typeof this.mmoService.setPlayerDefeatedForMovement === "function") {
        this.mmoService.setPlayerDefeatedForMovement(ctx.profile.id, true);
      }
      if (this.mmoService && typeof this.mmoService.stopPlayerMovementState === "function") {
        const stopped = this.mmoService.stopPlayerMovementState({
          user: ctx.sessionContext.user,
          session: ctx.sessionContext.session,
          player: ctx.profile,
          worldId: ctx.worldId
        }, ctx.profile, ctx.worldId, ctx.position, {}, { forceRevision: true });
        if (stopped) ctx.position = stopped;
      }
    }
    return { type: "retaliation", amount: damage, sourceId: enemy.instanceId, remainingHealth: after };
  }

  gatherTarget(ctx, targetId, operationId) {
    if (isResourceInstanceId(targetId)) return this.gatherResource(ctx, safeString(targetId, ""), operationId);
    const target = this.getEntityState(ctx, safeString(targetId, ""));
    if (!target || target.state.entityKind !== "resource") {
      const error = new Error("Resource target niet gevonden.");
      error.status = 404;
      throw error;
    }
    const resource = target.state;
    if (resource.available === false || resource.status === "depleted") {
      return { action: "gather", targetId: resource.instanceId, message: resource.displayName + " is tijdelijk depleted.", events: [] };
    }
    this.assertInRange(ctx, resource, "gather");
    const yieldMultiplier = Math.max(0, safeNumber(resource.yieldMultiplier, 1));
    const grants = yieldMultiplier > 0
      ? this.grantLootTable(ctx, resource.lootTableRef, operationId, resource.instanceId, "resource_gathered", yieldMultiplier)
      : [];
    for (const itemRef of yieldMultiplier > 0 && Array.isArray(resource.yieldItemRefs) ? resource.yieldItemRefs : []) {
      grants.push.apply(grants, this.grantItem(ctx, itemRef, Math.max(1, Math.round(yieldMultiplier)), "resource_gathered", resource.instanceId, operationId));
    }
    resource.available = false;
    resource.status = "depleted";
    resource.depletedBy = ctx.profile.id;
    resource.respawnAt = resource.respawnPolicyRef ? addMs(this.respawnDelay(ctx, resource.respawnPolicyRef)) : null;
    resource.updatedAt = now();
    this.saveEntityState(ctx, resource);
    this.recordGameplayEvent(ctx, "resource_gathered", "player", resource.instanceId, { grants });
    return {
      action: "gather",
      targetId: resource.instanceId,
      message: resource.displayName + " gathered.",
      events: [{ type: "gathered", targetId: resource.instanceId, label: resource.displayName }],
      grants
    };
  }

  pickupTarget(ctx, targetId, operationId) {
    const target = this.getEntityState(ctx, safeString(targetId, ""));
    if (!target || target.state.entityKind !== "pickup") {
      const error = new Error("Pickup target niet gevonden.");
      error.status = 404;
      throw error;
    }
    const pickup = target.state;
    const personal = pickup.claimMode === "personal" || pickup.claimMode === "once";
    // Ieder zijn eigen / Ieder 1×: de wereld-pickup blijft liggen; per speler onthouden wie hem had.
    const claim = personal ? this.pickupClaim(ctx.profile.id, pickup.instanceId) : null;
    if (personal ? claim : (pickup.available === false || pickup.status === "claimed")) {
      return { action: "pickup", targetId: pickup.instanceId, message: pickup.displayName + (pickup.claimMode === "once" ? ": die heb je al eens gepakt." : " is al opgepakt."), events: [] };
    }
    this.assertInRange(ctx, pickup, "pickup");
    // Quest Builder stap 4: uniek = max 1; een brief voor een quest die je al doet of al gedaan hebt pak je niet nog eens.
    if (pickup.pickupKind !== "currency") {
      const item = catalogSection(ctx.catalogs, "items")[pickup.itemRef] || {};
      const blocked = item.unique === true && this.ownedItemCount(ctx.profile.id, pickup.itemRef) >= 1
        ? "Je hebt al " + pickup.displayName + ". Daar kun je er maar 1 van hebben."
        : this.questPickupBlocked?.(ctx, pickup.itemRef) || "";
      if (blocked) return { action: "pickup", targetId: pickup.instanceId, message: blocked, events: [] };
    }
    const amount = pickup.pickupKind === "currency"
      ? Math.max(1, Math.round((safeInteger(pickup.minAmount, pickup.amount) + safeInteger(pickup.maxAmount, pickup.amount)) / 2))
      : Math.max(1, safeInteger(pickup.amount, 1));
    const grants = pickup.pickupKind === "currency"
      ? [this.grantCurrency(ctx, pickup.currencyRef, amount, "pickup_claimed", pickup.instanceId, operationId)]
      : this.grantItem(ctx, pickup.itemRef, amount, "pickup_claimed", pickup.instanceId, operationId);
    if (personal) {
      const respawnAt = pickup.claimMode === "once" ? null : addMs(this.respawnDelay(ctx, pickup.respawnPolicyRef));
      this.db.prepare(`
        INSERT INTO player_pickup_claims (player_id, instance_id, claimed_at, respawn_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(player_id, instance_id) DO UPDATE SET claimed_at = excluded.claimed_at, respawn_at = excluded.respawn_at
      `).run(ctx.profile.id, pickup.instanceId, now(), respawnAt);
    } else {
      pickup.available = false;
      pickup.status = "claimed";
      pickup.claimedBy = ctx.profile.id;
      pickup.respawnAt = pickup.respawnPolicyRef ? addMs(this.respawnDelay(ctx, pickup.respawnPolicyRef)) : null;
      pickup.updatedAt = now();
      this.saveEntityState(ctx, pickup);
    }
    this.recordGameplayEvent(ctx, "pickup_claimed", "player", pickup.instanceId, { grants });
    if (pickup.pickupKind !== "currency") {
      this.questEvents?.(ctx, [ctx.profile.id], { type: "pickup", refId: pickup.itemRef, eventKey: "pickup:" + pickup.instanceId + ":" + operationId, operationId,
        at: { x: Number.isFinite(Number(pickup.x)) ? Number(pickup.x) : ctx.position?.x, z: Number.isFinite(Number(pickup.z)) ? Number(pickup.z) : ctx.position?.z } });
    }
    return {
      action: "pickup",
      targetId: pickup.instanceId,
      message: pickup.displayName + " picked up.",
      events: [{ type: "picked_up", targetId: pickup.instanceId, label: pickup.displayName }],
      grants
    };
  }

  // Quest Builder stap 4: heeft deze speler deze pickup (Ieder zijn eigen / Ieder 1×) nu nog? null = nee, mag pakken.
  pickupClaim(playerId, instanceId) {
    const row = this.db.prepare("SELECT * FROM player_pickup_claims WHERE player_id = ? AND instance_id = ? LIMIT 1").get(playerId, instanceId);
    if (!row) return null;
    if (row.respawn_at && Date.parse(row.respawn_at) <= Date.now()) return null;
    return row;
  }

  physicalPortalCandidates(ctx) {
    const candidates = [];
    for (const zonePackage of projectZonePackages(ctx.project)) {
      const links = new Set((Array.isArray(zonePackage?.links) ? zonePackage.links : []).map(function (link) {
        return safeString(link?.linkId, "");
      }).filter(Boolean));
      for (const entity of Array.isArray(zonePackage?.entities) ? zonePackage.entities : []) {
        if (entity?.nodeType !== "entity_assembly" || entity.model?.nodeType !== "model_entity") continue;
        if (!safeString(entity.model.modelAssetId, "")) continue;
        const portal = (Array.isArray(entity.components) ? entity.components : []).find(function (component) {
          return component?.nodeType === "portal_component" && links.has(safeString(component.zoneLinkRef, ""));
        }) || null;
        if (!portal) continue;
        candidates.push({
          zoneId: safeString(zonePackage.zoneId || zonePackage.id, ""),
          zonePackage,
          portalRef: safeString(portal.componentId || portal.nodeId, ""),
          linkId: safeString(portal.zoneLinkRef, ""),
          x: safeNumber(entity.model.x, 0),
          y: safeNumber(entity.model.y, 0),
          z: safeNumber(entity.model.z, 0),
          facing: safeNumber(entity.model.facing ?? entity.model.rotationY, 0),
          label: safeString(entity.label || entity.model.label || portal.label, "Portal")
        });
      }
    }
    return candidates.filter(function (candidate) { return candidate.zoneId && candidate.portalRef; });
  }

  nearestDiscoveredRespawnPortal(ctx) {
    const config = this.mmoService.fogConfigForWorld(ctx.world);
    const discovered = config.enabled
      ? new Set(this.mmoService.listFogDiscoveryCells(ctx.profile.id, ctx.worldId, config.mapLayer || "overworld"))
      : null;
    const cellSize = Math.max(1, safeNumber(config.cellSize ?? config.fogChunkSize, 24));
    const originX = safeNumber(ctx.position?.x, 0);
    const originZ = safeNumber(ctx.position?.z, 0);
    return this.physicalPortalCandidates(ctx).filter(function (candidate) {
      if (!discovered) return true;
      const cellKey = Math.floor(candidate.x / cellSize) + ":" + Math.floor(candidate.z / cellSize);
      return discovered.has(cellKey);
    }).map(function (candidate) {
      const dx = candidate.x - originX;
      const dz = candidate.z - originZ;
      return Object.assign({ distanceSquared: dx * dx + dz * dz }, candidate);
    }).sort(function (left, right) {
      return left.distanceSquared - right.distanceSquared
        || left.portalRef.localeCompare(right.portalRef);
    })[0] || null;
  }

  // ---- Portals (8-11) ----
  portalFor(ctx, portalId) {
    const id = safeString(portalId, "");
    const portal = portalsOf(ctx.world).find((entry) => entry.id === id) || null;
    if (!portal || !portalVisibleFor(portal, ctx.profile.id, this.mmoService.worldFlags)) {
      const error = new Error("Deze portal bestaat niet (meer).");
      error.status = 404;
      throw error;
    }
    return portal;
  }

  portalRefused(message) {
    const error = new Error(message);
    error.status = 409;
    return error;
  }

  // De game vraagt dit als je dichtbij loopt; de server kijkt zelf of je er echt bent.
  portalUnlock(ctx, portalId) {
    const portal = this.portalFor(ctx, portalId);
    const unlocked = unlockedPortalIds(this.db, ctx.profile.id, ctx.worldId);
    if (isUnlocked(portal, unlocked)) return { action: "portal_unlock", portalId: portal.id, message: "" };
    if (!withinUnlockRange(ctx.position, portal)) throw this.portalRefused("Loop dichter naar de portal om hem vrij te spelen.");
    storeUnlock(this.db, ctx.profile.id, ctx.worldId, portal.id, now());
    this.recordGameplayEvent(ctx, "portal_unlocked", "player", portal.id, { portalId: portal.id });
    return { action: "portal_unlock", portalId: portal.id, message: "🌀 Portal vrijgespeeld: " + (portal.displayName || portal.id) + ". Tik erop op de kaart om hierheen te reizen." };
  }

  portalTravel(ctx, portalId, mateName = "") {
    const portal = this.portalFor(ctx, portalId);
    const rules = portalRulesOf(ctx.world);
    const playerId = ctx.profile.id;
    const unlocked = unlockedPortalIds(this.db, playerId, ctx.worldId);
    if (!isUnlocked(portal, unlocked)) throw this.portalRefused("Deze portal is nog niet vrijgespeeld. Loop er eerst naartoe.");
    const visible = portalsOf(ctx.world).filter((entry) => portalVisibleFor(entry, playerId, this.mmoService.worldFlags));
    const atPortal = portalNear(ctx.position, visible, unlocked);
    if (atPortal && atPortal.id === portal.id) throw this.portalRefused("Je staat al bij " + (portal.displayName || "deze portal") + ".");
    if (rules.travelFrom === "portal" && !atPortal) throw this.portalRefused("Je kunt alleen reizen als je bij een portal staat.");
    const nowMs = Date.now();
    const waitMs = (this.portalCooldowns.get(playerId) || 0) - nowMs;
    if (waitMs > 0) throw this.portalRefused("Nog " + Math.ceil(waitMs / 1000) + " s wachten voordat je weer kunt reizen.");
    const combatMs = Math.max(0, safeNumber(rules.combatBlockSeconds, 0)) * 1000;
    const combatAt = this.vitals()?.combatAt?.get(playerId) || 0;
    if (combatMs > 0 && nowMs - combatAt < combatMs) {
      throw this.portalRefused("Je bent nog in gevecht. Reizen kan over " + Math.ceil((combatMs - (nowMs - combatAt)) / 1000) + " s.");
    }
    const cost = travelCost(rules, ctx.position, portal, Boolean(atPortal));
    let paid = "";
    if (cost > 0) {
      const currencyName = displayForCurrency(ctx.catalogs, rules.costCurrencyId);
      const have = safeInteger(this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
        .get(playerId, rules.costCurrencyId)?.amount_minor, 0);
      if (have < cost) throw this.portalRefused("Niet genoeg " + currencyName + ": de reis kost " + cost + " en je hebt " + have + ".");
      this.removeCurrency(ctx, rules.costCurrencyId, cost, "portal_travel", portal.id);
      paid = " (−" + cost + " " + currencyName + ")";
    }
    const arrival = arrivalPoint(portal);
    const connection = { ...ctx.sessionContext, player: ctx.profile, worldId: ctx.worldId };
    const position = this.mmoService.applyTeleportState(connection, {
      zoneId: ctx.zoneId,
      position: arrival,
      animationState: "idle"
    }, { reason: "portal" });
    this.mmoService.schedulePersist(position, connection, true);
    ctx.position = position;
    if (rules.cooldownSeconds > 0) {
      if (this.portalCooldowns.size > 5000) this.portalCooldowns.clear();
      this.portalCooldowns.set(playerId, nowMs + rules.cooldownSeconds * 1000);
    }
    this.recordGameplayEvent(ctx, "portal_travel", "player", portal.id, { portalId: portal.id, cost });
    return {
      action: "portal_travel",
      portalId: portal.id,
      message: "🌀 " + (portal.displayName || "Portal") + (mateName ? " (bij " + mateName + ")" : "") + paid + ".",
      position: this.mmoService.publicPositionForPlayer(position, ctx.sessionContext.session, ctx.worldId)
    };
  }

  // Kevin 8-11: naar een teamgenoot reizen = naar de vrije portal (van jou) die het dichtst bij hem staat.
  portalTravelToMate(ctx, mateId) {
    const id = safeString(mateId, "");
    const party = this.mmoService.partyRuntime;
    const partyId = party ? party.partyIdFor(ctx.profile.id) : null;
    if (!id || id === ctx.profile.id || !partyId || party.partyIdFor(id) !== partyId) throw this.portalRefused("Je kunt alleen naar iemand uit je groep reizen.");
    const cached = this.mmoService.playerStateCache?.get(this.mmoService.getPlayerStateCacheKey(id, ctx.worldId)) || null;
    const where = cached || this.db.prepare("SELECT x, z FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1").get(id, ctx.worldId) || null;
    if (!where) throw this.portalRefused("Waar je teamgenoot is, is nog niet bekend.");
    const mate = { x: safeNumber(where.x, 0), z: safeNumber(where.z, 0) };
    const unlocked = unlockedPortalIds(this.db, ctx.profile.id, ctx.worldId);
    const visible = portalsOf(ctx.world).filter((entry) => portalVisibleFor(entry, ctx.profile.id, this.mmoService.worldFlags) && isUnlocked(entry, unlocked));
    let best = null;
    for (const entry of visible) {
      const distance = Math.hypot(safeNumber(entry.x) - mate.x, safeNumber(entry.z) - mate.z);
      if (!best || distance < best.distance) best = { portal: entry, distance };
    }
    if (!best) throw this.portalRefused("Je hebt nog geen portal vrijgespeeld.");
    const name = safeString(this.db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(id)?.display_name, "je teamgenoot");
    const result = this.portalTravel(ctx, best.portal.id, name);
    return Object.assign(result, { action: "portal_travel_mate", mateId: id });
  }

  // Na doodgaan: de dichtstbijzijnde vrije portal met "Respawn hier" (zelfde vorm als de oude node-portals).
  gamePortalRespawn(ctx) {
    const rules = portalRulesOf(ctx.world);
    if (rules.respawnAtPortal === false) return null;
    const unlocked = unlockedPortalIds(this.db, ctx.profile.id, ctx.worldId);
    const portal = nearestRespawnPortal(portalsOf(ctx.world), unlocked, ctx.position,
      (entry) => portalVisibleFor(entry, ctx.profile.id, this.mmoService.worldFlags));
    if (!portal) return null;
    const arrival = arrivalPoint(portal);
    return { zoneId: ctx.zoneId, zonePackage: ctx.zonePackage, portalRef: "portal:" + portal.id, linkId: null,
      x: arrival.x, y: arrival.y, z: arrival.z, facing: arrival.rotationY, label: portal.displayName || "portal" };
  }

  portalSnapshot(ctx) {
    if (!portalsOf(ctx.world).length) return null;
    const unlocked = unlockedPortalIds(this.db, ctx.profile.id, ctx.worldId);
    return publicPortalState(ctx.world, unlocked, ctx.profile.id, this.mmoService.worldFlags, ctx.position,
      (this.portalCooldowns.get(ctx.profile.id) || 0) - Date.now());
  }

  unstuckPlayer(ctx) {
    // Kevin 8-11: met portals in de wereld ga je naar de dichtstbijzijnde vrijgespeelde portal (direct, zonder de wereld te herladen).
    if (portalsOf(ctx.world).length) {
      const unlocked = unlockedPortalIds(this.db, ctx.profile.id, ctx.worldId);
      const portal = nearestRespawnPortal(portalsOf(ctx.world).map((entry) => Object.assign({}, entry, { respawnHere: true })), unlocked, ctx.position,
        (entry) => portalVisibleFor(entry, ctx.profile.id, this.mmoService.worldFlags));
      if (portal) {
        const arrival = arrivalPoint(portal);
        const connection = { ...ctx.sessionContext, player: ctx.profile, worldId: ctx.worldId };
        const position = this.mmoService.applyTeleportState(connection, { zoneId: ctx.zoneId, position: arrival, animationState: "idle" }, { reason: "unstuck" });
        this.mmoService.schedulePersist(position, connection, true);
        ctx.position = position;
        return {
          action: "unstuck",
          message: "Je bent terug bij " + (portal.displayName || "de dichtstbijzijnde portal") + ".",
          position: this.mmoService.publicPositionForPlayer(position, ctx.sessionContext.session, ctx.worldId)
        };
      }
    }
    const spawnRef = ctx.position.current_spawn_id;
    const zones = [ctx.zonePackage, ...projectZonePackages(ctx.project).filter((zone) => zone.zoneId !== ctx.zoneId)];
    let target = null;
    if (spawnRef) {
      for (const zone of zones) {
        target = this.mmoService.findZonePortal(ctx.world, zone.zoneId, spawnRef)
          || this.mmoService.findZoneSpawn(ctx.world, zone.zoneId, spawnRef);
        if (target) break;
      }
    }
    const zonePackage = target?.zonePackage || ctx.zonePackage;
    const arrival = target?.model
      ? this.mmoService.portalArrivalPoint(ctx.worldContext, target)
      : target?.spawn || zoneDefaultSpawn(zonePackage, ctx.world);
    const arrivalRef = target ? spawnRef : arrival.spawnId;
    const connection = { ...ctx.sessionContext, player: ctx.profile, worldId: ctx.worldId };
    const position = this.mmoService.applyTeleportState(connection, {
      zoneId: zonePackage.zoneId,
      spawnId: arrivalRef,
      position: { x: arrival.x, y: arrival.y, z: arrival.z, rotationY: arrival.facing ?? arrival.rotationY ?? 0 },
      animationState: "idle"
    }, { reason: "unstuck" });
    this.mmoService.syncPlayerProfileZone(ctx.profile, ctx.worldId, zonePackage.zoneId);
    this.mmoService.schedulePersist(position, connection, true);
    ctx.position = position;
    ctx.zonePackage = zonePackage;
    ctx.zoneId = zonePackage.zoneId;
    return {
      action: "unstuck",
      message: target ? "Je bent terug bij je laatste portal of respawnplek." : "Je bent terug bij de startplek van deze zone.",
      position: this.mmoService.publicPositionForPlayer(position, ctx.sessionContext.session, ctx.worldId),
      gameWorld: this.mmoService.gameWorldForZone(ctx.world, zonePackage.zoneId, target?.model ? null : arrivalRef)
    };
  }

  respawnPlayer(ctx, operationId) {
    if (!this.isPlayerDead(ctx)) {
      const error = new Error("Respawn is alleen beschikbaar wanneer je speler verslagen is.");
      error.status = 409;
      throw error;
    }
    // Fase 8 herstel 3 (Kevin 13-11): doodgaan = je buit die nog lag is weg.
    this.db.prepare("UPDATE player_pending_loot SET state = 'expired', updated_at = ?, revision = revision + 1 WHERE player_id = ? AND state = 'open'").run(now(), ctx.profile.id);
    const portal = portalsOf(ctx.world).length ? this.gamePortalRespawn(ctx) : this.nearestDiscoveredRespawnPortal(ctx);
    const targetZonePackage = portal?.zonePackage || ctx.zonePackage;
    const fallbackSpawn = zoneDefaultSpawn(targetZonePackage, ctx.world);
    const target = portal || {
      zoneId: safeString(targetZonePackage?.zoneId, ctx.zoneId),
      portalRef: null,
      linkId: null,
      x: safeNumber(fallbackSpawn.x, 0),
      y: safeNumber(fallbackSpawn.y, 0),
      z: safeNumber(fallbackSpawn.z, 0),
      facing: safeNumber(fallbackSpawn.facing, 0),
      label: safeString(targetZonePackage?.zone?.displayName, "zone start")
    };
    clearEffectsForDeath(this.db, ctx.profile.id, this.combatRules(ctx.project));
    const policy = policiesOfType(ctx.project, "death_respawn_rules")[0] || {};
    const restorePercentByStat = {
      [HEALTH_STAT_ID]: clamp(safeNumber(policy.healthRestorePercent, 1), 0, 1),
      [MANA_STAT_ID]: clamp(safeNumber(policy.manaRestorePercent, 1), 0, 1),
      [STAMINA_STAT_ID]: clamp(safeNumber(policy.staminaRestorePercent, 1), 0, 1)
    };
    const stats = this.loadPlayerStats(ctx.profile.id);
    const stamp = now();
    for (const statId of [HEALTH_STAT_ID, MANA_STAT_ID, STAMINA_STAT_ID]) {
      const row = stats.byId[statId];
      if (!row) continue;
      const maximum = effectiveMaxStat(row, row.baseValue);
      let restored = maximum * restorePercentByStat[statId];
      if (statId === HEALTH_STAT_ID && maximum > 0) restored = Math.max(1, restored);
      this.db.prepare(`
        UPDATE player_stats
        SET current_value = ?, revision = revision + 1, updated_at = ?
        WHERE player_id = ? AND stat_id = ?
      `).run(restored, stamp, ctx.profile.id, statId);
    }
    const spawnRef = portal ? portal.portalRef : (fallbackSpawn.spawnId || null);
    this.db.prepare(`
      INSERT INTO player_positions (player_id, world_id, current_zone_id, current_spawn_id, active_checkpoint_id, x, y, z, rotation_y, revision, last_update_source_session_id, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(player_id, world_id) DO UPDATE SET
        current_zone_id = excluded.current_zone_id,
        current_spawn_id = excluded.current_spawn_id,
        active_checkpoint_id = NULL,
        x = excluded.x,
        y = excluded.y,
        z = excluded.z,
        rotation_y = excluded.rotation_y,
        revision = player_positions.revision + 1,
        last_update_source_session_id = excluded.last_update_source_session_id,
        updated_at = excluded.updated_at
    `).run(
      ctx.profile.id,
      ctx.worldId,
      target.zoneId,
      spawnRef,
      target.x,
      target.y,
      target.z,
      target.facing,
      ctx.sessionContext.session.id,
      stamp
    );
    this.db.prepare("UPDATE player_profiles SET current_zone_id = ?, current_world_id = ?, updated_at = ? WHERE id = ?")
      .run(target.zoneId, ctx.worldId, stamp, ctx.profile.id);
    if (this.mmoService.playerStateCache && typeof this.mmoService.playerStateCache.delete === "function") {
      this.mmoService.playerStateCache.delete(ctx.profile.id + "::" + ctx.worldId);
    }
    const positionRow = this.db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1")
      .get(ctx.profile.id, ctx.worldId);
    const normalized = this.mmoService.normalizePositionRecord(positionRow, ctx.sessionContext, ctx.worldId);
    const stopped = this.mmoService.resetPlayerMovementAfterRespawn(ctx.profile.id, ctx.worldId, ctx.sessionContext, normalized);
    ctx.position = stopped || normalized;
    ctx.zonePackage = targetZonePackage;
    ctx.zoneId = target.zoneId;
    ctx.profile.current_zone_id = target.zoneId;
    ctx.profile.current_world_id = ctx.worldId;
    this.recordGameplayEvent(ctx, "player_respawned", "player", portal?.portalRef || null, {
      zoneId: target.zoneId,
      portalRef: portal?.portalRef || null,
      zoneDefaultFallback: !portal
    });
    return {
      action: "respawn",
      message: portal ? "Respawn bij " + portal.label + "." : "Geen vrijgespeelde portal gevonden; respawn bij de zone-start.",
      position: this.mmoService.publicPositionForPlayer(ctx.position, ctx.sessionContext.session, ctx.worldId),
      gameWorld: this.mmoService.gameWorldForZone(ctx.world, target.zoneId, portal ? null : spawnRef),
      respawnPortalRef: portal?.portalRef || null,
      respawnLinkId: portal?.linkId || null,
      usedZoneDefaultFallback: !portal,
      events: [{ type: "respawn", zoneId: target.zoneId, portalRef: portal?.portalRef || null }],
      grants: []
    };
  }

  resetDemo(ctx, operationId) {
    const spawn = zoneDefaultSpawn(ctx.zonePackage, ctx.world);
    this.db.prepare(`
      DELETE FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id LIKE ?
    `).run(ctx.worldId, ctx.zoneId, NODE03_INSTANCE_PREFIX + "%");
    this.db.prepare("DELETE FROM player_resource_state WHERE player_id = ?").run(ctx.profile.id);
    const stats = this.loadPlayerStats(ctx.profile.id);
    const stamp = now();
    for (const statId of [HEALTH_STAT_ID, MANA_STAT_ID]) {
      const row = stats.byId[statId];
      if (!row) continue;
      this.db.prepare(`
        UPDATE player_stats
        SET current_value = ?, revision = revision + 1, updated_at = ?
        WHERE player_id = ? AND stat_id = ?
      `).run(effectiveMaxStat(row, row.baseValue), stamp, ctx.profile.id, statId);
    }
    this.db.prepare(`
      INSERT INTO player_positions (player_id, world_id, current_zone_id, current_spawn_id, active_checkpoint_id, x, y, z, rotation_y, revision, last_update_source_session_id, updated_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(player_id, world_id) DO UPDATE SET
        current_zone_id = excluded.current_zone_id,
        current_spawn_id = excluded.current_spawn_id,
        active_checkpoint_id = NULL,
        x = excluded.x,
        y = excluded.y,
        z = excluded.z,
        rotation_y = excluded.rotation_y,
        revision = player_positions.revision + 1,
        last_update_source_session_id = excluded.last_update_source_session_id,
        updated_at = excluded.updated_at
    `).run(
      ctx.profile.id,
      ctx.worldId,
      ctx.zoneId,
      spawn.spawnId || null,
      safeNumber(spawn.x, 0),
      safeNumber(spawn.y, 0),
      safeNumber(spawn.z, 0),
      safeNumber(spawn.facing, 0),
      ctx.sessionContext.session.id,
      stamp
    );
    this.db.prepare("UPDATE player_profiles SET current_zone_id = ?, current_world_id = ?, updated_at = ? WHERE id = ?")
      .run(ctx.zoneId, ctx.worldId, stamp, ctx.profile.id);
    if (this.mmoService.playerStateCache && typeof this.mmoService.playerStateCache.delete === "function") {
      this.mmoService.playerStateCache.delete(ctx.profile.id + "::" + ctx.worldId);
    }
    const row = this.db.prepare("SELECT * FROM player_positions WHERE player_id = ? AND world_id = ? LIMIT 1").get(ctx.profile.id, ctx.worldId);
    const normalized = this.mmoService.normalizePositionRecord(row, ctx.sessionContext, ctx.worldId);
    const stopped = this.mmoService && typeof this.mmoService.resetPlayerMovementAfterRespawn === "function"
      ? this.mmoService.resetPlayerMovementAfterRespawn(ctx.profile.id, ctx.worldId, ctx.sessionContext, normalized)
      : null;
    ctx.position = stopped || normalized;
    this.ensureZoneEntityState(ctx);
    this.recordGameplayEvent(ctx, "node03_demo_reset", "player", null, { zoneId: ctx.zoneId });
    return {
      action: "reset_demo",
      message: "Spelergegevens opnieuw ingesteld.",
      position: this.mmoService.publicPositionForPlayer(ctx.position, ctx.sessionContext.session, ctx.worldId),
      events: [{ type: "reset", zoneId: ctx.zoneId }],
      grants: []
    };
  }

  grantLootTable(ctx, lootTableRef, operationId, sourceRef, reason, multiplier = 1) {
    const table = catalogSection(ctx.catalogs, "lootTables")[lootTableRef] || null;
    const grants = [];
    const quantityMultiplier = Math.max(0, safeNumber(multiplier, 1));
    if (quantityMultiplier <= 0) return grants;
    for (const entry of Array.isArray(table?.entries) ? table.entries : []) {
      // Every rule rolls on its own: "guaranteed" always drops, otherwise the
      // chance (0..1) is a real probability.
      const chance = Math.max(0, Math.min(1, safeNumber(entry?.chance, 1)));
      if (entry?.guaranteed !== true && !(Math.random() < chance)) continue;
      if (entry.itemRef) {
        const amount = rollLootAmount(entry.minQuantity, entry.maxQuantity, quantityMultiplier);
        if (amount > 0) grants.push.apply(grants, this.grantItem(ctx, entry.itemRef, amount, reason, sourceRef, operationId));
      } else if (entry.currencyRef) {
        const amount = rollLootAmount(entry.minAmountMinor, entry.maxAmountMinor, quantityMultiplier);
        if (amount > 0) grants.push(this.grantCurrency(ctx, entry.currencyRef, amount, reason, sourceRef, operationId));
      }
    }
    return grants.filter(Boolean);
  }

  grantItem(ctx, itemId, amount, reason, sourceRef, operationId = randomId("node03_grant")) {
    const item = catalogSection(ctx.catalogs, "items")[itemId] || {};
    // Quest Builder stap 4: uniek = je kunt er maar 1 hebben (buit of beloning geeft er dan niet nog een).
    if (item.unique === true && this.ownedItemCount(ctx.profile.id, itemId) >= 1) return [];
    const quantity = item.unique === true ? 1 : Math.max(1, safeInteger(amount, 1));
    if (item.stackable !== false) {
      const bindState = item.bindPolicy === "bind_on_pickup" ? "bound" : DEFAULT_BIND_STATE;
      const existing = this.db.prepare("SELECT quantity FROM player_inventory_stacks WHERE player_id = ? AND item_id = ? AND bind_state = ? LIMIT 1")
        .get(ctx.profile.id, itemId, bindState);
      const before = safeInteger(existing?.quantity, 0);
      const stackId = existing ? null : "stack_" + crypto.randomUUID();
      const stamp = now();
      this.db.prepare(`
        INSERT INTO player_inventory_stacks (stack_id, player_id, item_id, bind_state, quantity, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(player_id, item_id, bind_state) DO UPDATE SET
          quantity = player_inventory_stacks.quantity + excluded.quantity,
          revision = player_inventory_stacks.revision + 1,
          updated_at = excluded.updated_at
      `).run(stackId || "stack_" + crypto.randomUUID(), ctx.profile.id, itemId, bindState, quantity, stamp, stamp);
      this.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, quantity, before, before + quantity, reason, sourceRef);
      return [{ kind: "item_stack", itemId, displayName: displayForItem(ctx.catalogs, itemId), amount: quantity }];
    }
    const grants = [];
    for (let index = 0; index < quantity; index += 1) {
      const id = "item_instance_" + crypto.randomUUID();
      const stamp = now();
      this.db.prepare(`
        INSERT INTO player_item_instances (id, player_id, item_id, bind_state, quality, durability, max_durability, modifiers_json, location_type, location_ref, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, '[]', 'inventory', NULL, 1, ?, ?)
      `).run(id, ctx.profile.id, itemId, DEFAULT_BIND_STATE, item.rarity || null, item.durabilityMax || null, item.durabilityMax || null, stamp, stamp);
      this.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, 1, 0, 1, reason, sourceRef);
      grants.push({ kind: "item_instance", itemId, instanceId: id, displayName: displayForItem(ctx.catalogs, itemId), amount: 1 });
    }
    return grants;
  }

  // ---- Fase 8 herstel 2 (Kevin 12-11): het buitvenster ----
  // De voorkeur komt van de speler zelf (vinkje in het spelmenu) en gaat met elke actie mee. Onbekend = automatisch,
  // zodat een oudere client en de tests werken zoals eerst.
  rememberAutoLoot(playerId, value) {
    if (!this.autoLootPrefs) this.autoLootPrefs = new Map();
    if (playerId && typeof value === "boolean") this.autoLootPrefs.set(playerId, value);
  }

  autoLootFor(playerId) {
    const value = this.autoLootPrefs ? this.autoLootPrefs.get(playerId) : undefined;
    return value === undefined ? true : value === true;
  }

  // Leg buit klaar voor één speler. Geeft het id terug, of null als er niets te pakken valt.
  holdLoot(ctx, playerId, sourceKind, sourceRef, label, rows, reason, operationId, at = null) {
    const entries = (Array.isArray(rows) ? rows : []).map(function (row, index) {
      const quantity = Math.max(1, safeInteger(row?.quantity, 1));
      if (row?.currencyId) return { key: String(index + 1), currencyId: String(row.currencyId), quantity };
      if (row?.itemId) return { key: String(index + 1), itemId: String(row.itemId), quantity };
      return null;
    }).filter(Boolean);
    if (!entries.length) return null;
    const id = "loot_" + crypto.randomUUID();
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_pending_loot (id, player_id, world_id, source_kind, source_ref, label, reason, entries_json, state, operation_id, revision, created_at, updated_at, expires_at, x, z)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, 1, ?, ?, ?, ?, ?)
    `).run(id, playerId, ctx.worldId || "world.main", sourceKind, safeString(sourceRef, "-"), label || null, reason, stableJson(entries), operationId || null,
      stamp, stamp, new Date(Date.now() + LOOT_KEEP_MS).toISOString(),
      // Fase 8 herstel 3: de plek van de vijand of grondstof (anders waar de speler stond).
      round(safeNumber(at?.x, safeNumber(ctx.position?.x, 0))), round(safeNumber(at?.z, safeNumber(ctx.position?.z, 0))));
    return id;
  }

  // Fase 8 herstel 3 (Kevin 13-11): buit pakken kan binnen "Buit pakken binnen" (💰 Geld) van de plek.
  lootRangeM(ctx) {
    return Math.max(1, safeInteger(economyValues(policiesOfType(ctx.project, "economy_rules")[0] || null).lootRangeM, 15));
  }

  // Je open buit in de buurt. Wat te lang lag, waar je te ver vandaan bent, of alles als je dood bent: dicht.
  // (Weet de server even niet waar je staat, dan blijft het liggen.)
  nearLoot(ctx) {
    const stamp = now();
    const playerId = ctx.profile.id;
    this.db.prepare("UPDATE player_pending_loot SET state = 'expired', updated_at = ?, revision = revision + 1 WHERE player_id = ? AND state = 'open' AND expires_at <= ?")
      .run(stamp, playerId, stamp);
    const rows = this.db.prepare("SELECT * FROM player_pending_loot WHERE player_id = ? AND state = 'open' ORDER BY created_at ASC LIMIT 80").all(playerId);
    if (!rows.length) return [];
    const dead = this.isPlayerDead(ctx);
    const range = this.lootRangeM(ctx);
    const px = Number(ctx.position?.x);
    const pz = Number(ctx.position?.z);
    const known = Number.isFinite(px) && Number.isFinite(pz);
    const near = [];
    const close = this.db.prepare("UPDATE player_pending_loot SET state = 'expired', updated_at = ?, revision = revision + 1 WHERE id = ? AND state = 'open'");
    for (const row of rows) {
      const placed = row.x !== null && row.x !== undefined && row.z !== null && row.z !== undefined;
      const far = dead || !placed || (known && Math.hypot(Number(row.x) - px, Number(row.z) - pz) > range);
      if (far) close.run(stamp, row.id);
      else near.push(row);
    }
    return near;
  }

  lootKey(entry) {
    return entry?.currencyId ? "currency:" + entry.currencyId : "item:" + entry?.itemId;
  }

  // Wat de HUD toont: alle buit in de buurt samen, gelijke dingen opgeteld (al het goud bij elkaar).
  lootForHud(ctx) {
    const near = this.nearLoot(ctx);
    // Opgeruimde buit (gepakt of verlopen) na een dag weg, zodat de tabel klein blijft op een oude laptop.
    this.db.prepare("DELETE FROM player_pending_loot WHERE player_id = ? AND state <> 'open' AND updated_at < ?")
      .run(ctx.profile.id, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
    const merged = new Map();
    const from = new Map();
    for (const row of near) {
      const label = row.label || (row.source_kind === "resource" ? "Grondstof" : "Vijand");
      from.set(label, (from.get(label) || 0) + 1);
      for (const entry of safeJsonParse(row.entries_json, [])) {
        const key = this.lootKey(entry);
        const have = merged.get(key) || { key, kind: entry.currencyId ? "currency" : "item", itemId: entry.itemId || null, currencyId: entry.currencyId || null, quantity: 0,
          displayName: entry.currencyId ? displayForCurrency(ctx.catalogs, entry.currencyId) : displayForItem(ctx.catalogs, entry.itemId) };
        have.quantity += Math.max(1, safeInteger(entry.quantity, 1));
        merged.set(key, have);
      }
    }
    // Geld bovenaan, daarna de items op naam.
    const rows = Array.from(merged.values()).sort(function (a, b) {
      if (a.kind !== b.kind) return a.kind === "currency" ? -1 : 1;
      return String(a.displayName).localeCompare(String(b.displayName), "nl");
    });
    const pref = this.autoLootPrefs ? this.autoLootPrefs.get(ctx.profile.id) : undefined;
    return {
      autoLoot: pref === undefined ? null : pref,
      keepSeconds: Math.round(LOOT_KEEP_MS / 1000),
      rangeM: this.lootRangeM(ctx),
      ids: near.map((row) => row.id),
      from: Array.from(from, ([label, count]) => (count > 1 ? label + " ×" + count : label)).join(", "),
      rows
    };
  }

  // Pakken: één soort (entryKey, bijv. "item:item.vacht" of "currency:currency.goud") uit alle buit in de buurt, of alles.
  // Alles in dezelfde transactie: het gaat in je tas en verdwijnt hier tegelijk.
  takeLoot(ctx, payload, operationId, all) {
    const entryKey = safeString(payload.entryKey || payload.entry_key, "");
    if (!all && !entryKey) throw httpError(400, "Kies wat je wilt pakken.");
    const live = this.nearLoot(ctx);
    if (!live.length) throw httpError(404, "Er ligt hier geen buit (meer). Buit blijft alleen liggen zolang je in de buurt blijft.");
    const stamp = now();
    const grants = [];
    const kept = [];
    let found = false;
    for (const row of live) {
      const entries = safeJsonParse(row.entries_json, []);
      const left = [];
      for (const entry of entries) {
        if (!all && this.lootKey(entry) !== entryKey) { left.push(entry); continue; }
        found = true;
        // Een uniek item dat je al hebt blijft liggen (anders zou het verdwijnen).
        const item = entry.itemId ? catalogSection(ctx.catalogs, "items")[entry.itemId] || {} : null;
        if (item && item.unique === true && this.ownedItemCount(ctx.profile.id, entry.itemId) >= 1) {
          kept.push(displayForItem(ctx.catalogs, entry.itemId));
          left.push(entry);
          continue;
        }
        grants.push(...this.grantLootRow(ctx, { itemId: entry.itemId || null, currencyId: entry.currencyId || null, quantity: entry.quantity },
          row.reason || "loot_taken", row.source_ref, operationId));
      }
      if (left.length === entries.length) continue;
      this.db.prepare("UPDATE player_pending_loot SET entries_json = ?, state = ?, updated_at = ?, revision = revision + 1 WHERE id = ?")
        .run(stableJson(left), left.length ? "open" : "taken", stamp, row.id);
    }
    if (!found) throw httpError(404, "Dat ligt er niet meer.");
    const keptNames = Array.from(new Set(kept));
    if (!grants.length && keptNames.length) throw httpError(409, "Je hebt al " + keptNames.join(", ") + "; dat mag je maar één keer hebben.");
    return {
      action: all ? "loot_take_all" : "loot_take",
      grants,
      events: [{ type: "looted", amount: grants.length }],
      message: keptNames.length ? "Bleef liggen (heb je al): " + keptNames.join(", ") + "." : ""
    };
  }

  // Fase 8: één regel buit: een item of geld (een loottabel mag geld laten vallen).
  grantLootRow(ctx, row, reason, sourceRef, operationId) {
    if (row && row.currencyId) {
      const grant = this.grantCurrency(ctx, row.currencyId, row.quantity, reason, sourceRef, operationId);
      return grant ? [grant] : [];
    }
    return this.grantItem(ctx, row.itemId, row.quantity, reason, sourceRef, operationId);
  }

  grantCurrency(ctx, currencyId, amountMinor, reason, sourceRef, operationId = randomId("node03_grant")) {
    const amount = Math.max(0, safeInteger(amountMinor, 0));
    if (!currencyId || amount <= 0) return null;
    const existing = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(ctx.profile.id, currencyId);
    const before = safeInteger(existing?.amount_minor, 0);
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_currencies (player_id, currency_id, amount_minor, revision, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(player_id, currency_id) DO UPDATE SET
        amount_minor = player_currencies.amount_minor + excluded.amount_minor,
        revision = player_currencies.revision + 1,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, currencyId, amount, stamp);
    this.recordLedger(operationId, ctx.profile.id, "currency", currencyId, amount, before, before + amount, reason, sourceRef);
    return { kind: "currency", currencyId, displayName: displayForCurrency(ctx.catalogs, currencyId), amountMinor: amount };
  }

  removeCurrency(ctx, currencyId, amountMinor, reason, sourceRef, operationId = randomId("node03_remove")) {
    const amount = Math.max(0, safeInteger(amountMinor, 0));
    if (!currencyId || amount <= 0) return 0;
    const existing = this.db.prepare("SELECT amount_minor FROM player_currencies WHERE player_id = ? AND currency_id = ? LIMIT 1")
      .get(ctx.profile.id, currencyId);
    const before = safeInteger(existing?.amount_minor, 0);
    const removed = Math.min(before, amount);
    const after = before - removed;
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_currencies (player_id, currency_id, amount_minor, revision, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(player_id, currency_id) DO UPDATE SET
        amount_minor = excluded.amount_minor,
        revision = player_currencies.revision + 1,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, currencyId, after, stamp);
    if (removed > 0) this.recordLedger(operationId, ctx.profile.id, "currency", currencyId, -removed, before, after, reason, sourceRef);
    return removed;
  }

  removeInventoryItem(ctx, itemId, amount, reason, sourceRef, operationId = randomId("node03_remove")) {
    let remaining = Math.max(1, safeInteger(amount, 1));
    let removed = 0;
    const stacks = this.db.prepare(`
      SELECT * FROM player_inventory_stacks
      WHERE player_id = ? AND item_id = ? AND quantity > 0
      ORDER BY updated_at ASC
    `).all(ctx.profile.id, itemId);
    for (const stack of stacks) {
      if (remaining <= 0) break;
      const before = safeInteger(stack.quantity, 0);
      const take = Math.min(before, remaining);
      const after = before - take;
      this.db.prepare(`
        UPDATE player_inventory_stacks
        SET quantity = ?, revision = revision + 1, updated_at = ?
        WHERE stack_id = ?
      `).run(after, now(), stack.stack_id);
      this.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, -take, before, after, reason, sourceRef);
      removed += take;
      remaining -= take;
    }
    if (remaining > 0) {
      const instances = this.db.prepare(`
        SELECT * FROM player_item_instances
        WHERE player_id = ? AND item_id = ? AND location_type = 'inventory'
        ORDER BY updated_at ASC
        LIMIT ?
      `).all(ctx.profile.id, itemId, remaining);
      for (const instance of instances) {
        this.db.prepare(`
          UPDATE player_item_instances
          SET location_type = 'deleted', locked_by_operation_id = ?, revision = revision + 1, updated_at = ?
          WHERE id = ?
        `).run(operationId, now(), instance.id);
        this.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, -1, 1, 0, reason, sourceRef);
        removed += 1;
        remaining -= 1;
      }
    }
    return removed;
  }

  grantXpForEnemy(ctx, enemy, operationId) {
    const policy = policiesOfType(ctx.project, "xp_source_rule")[0] || {};
    const amount = Math.max(0, Math.round(formulaValue(policy.amountFormula, 35)));
    return this.grantXpAmount(ctx, amount, "enemy_defeated", enemy.instanceId, operationId);
  }

  grantXpAmount(ctx, amount, reason, sourceRef, operationId) {
    // Fase 7: XP-tempo (Instellingen > Balans). De maker-knop "+XP" geeft precies wat er staat.
    if (reason !== "maker_xp") amount = scaledXp(amount, this.combatRules(ctx.project).xpRatePct);
    if (amount <= 0) return null;
    const policy = policiesOfType(ctx.project, "xp_source_rule")[0] || {};
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = policy.curveRef || progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const maxLevel = progressionPolicy.maxLevel || 10;
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id);
    if (!row) return null;
    const beforeXp = safeInteger(row?.xp, 0);
    const beforeLevel = safeInteger(row?.level, 1);
    const afterXp = beforeXp + amount;
    const afterLevel = levelForXp(ctx.catalogs, curveRef, afterXp, maxLevel);
    const skillGain = Math.max(0, afterLevel - beforeLevel);
    this.db.prepare(`
      UPDATE player_progression
      SET xp = ?, level = ?, skill_points = skill_points + ?, revision = revision + 1, updated_at = ?
      WHERE player_id = ?
    `).run(afterXp, afterLevel, skillGain, now(), ctx.profile.id);
    this.recordLedger(operationId, ctx.profile.id, "xp", "xp", amount, beforeXp, afterXp, reason, sourceRef);
    if (afterLevel !== beforeLevel) this.levelChanged(ctx, ctx.profile.id, beforeLevel, afterLevel);
    return { kind: "xp", amount, beforeXp, afterXp, beforeLevel, afterLevel };
  }

  // Fase 6: een character kreeg een ander level. Zijn stats groeien mee (klasse: groei per level); bij omhoog
  // levens en mana vol (Instellingen > Genezen en effecten) en iedereen in de buurt ziet het effect.
  levelChanged(ctx, playerId, beforeLevel, afterLevel) {
    this.syncStatsForLevel(playerId, ctx.catalogs, this.statBlockRefForPlayer(ctx, playerId), afterLevel);
    if (afterLevel <= beforeLevel) return;
    if (this.combatRules(ctx.project).levelUpRestore) {
      this.db.prepare("UPDATE player_stats SET current_value = base_value + earned_value, revision = revision + 1, updated_at = ? WHERE player_id = ? AND stat_id IN (?, ?)")
        .run(now(), playerId, HEALTH_STAT_ID, MANA_STAT_ID);
    }
    this.broadcastFx(ctx.worldId, { target: playerId, tone: "levelup", level: afterLevel });
    // Ook wie meevocht (niet de speler van deze actie) ziet zijn balken meteen groeien.
    const vitals = this.vitals();
    if (vitals) setTimeout(() => { try { vitals.push(playerId, ctx.worldId, Date.now(), null, [], true); } catch {} }, 0);
  }

  // Fase 6: het level van een character (1 als hij nog geen voortgang heeft).
  levelOfPlayer(playerId) {
    return Math.max(1, safeInteger(this.db.prepare("SELECT level FROM player_progression WHERE player_id = ? LIMIT 1").get(playerId)?.level, 1));
  }

  // ---- Fase 05: canonieke vijanden en grondstoffen (plan in actor-runtime, schrijven hier, in de operatie) ----

  // Bonus van gedragen uitrusting (canonieke items: attackPowerBonus / armorBonus).
  // Fase 6: atLevel = het level waar de speler nu als telt (schaling). Uitrusting "vanaf level N" telt onder N naar verhouding.
  equipmentBonusesForPlayer(playerId, catalogs, atLevel = null) {
    const items = catalogSection(catalogs, "items");
    const bonus = { attackPower: 0, armor: 0 };
    const rows = this.db.prepare(`
      SELECT i.item_id FROM player_equipment e JOIN player_item_instances i ON i.id = e.item_instance_id WHERE e.player_id = ?
    `).all(playerId);
    for (const row of rows) {
      const item = items[row.item_id] || {};
      const part = (value) => (atLevel ? equipBonusAt(value, safeInteger(item.requiredLevel, 1), atLevel) : value);
      bonus.attackPower += part(Math.max(0, safeInteger(item.attackPowerBonus, 0)));
      bonus.armor += part(Math.max(0, safeInteger(item.armorBonus, 0)));
    }
    return bonus;
  }

  // Fase 6: hoe een speler telt tegen een vijand van een level.
  // Schaling aan: zijn klasse-stats op het level van de vijand, uitrusting naar verhouding, en het schuifje Verschil per level
  // (edgePct: plus = voordeel, min = nadeel). Schaling uit of geen vijand-level: zijn echte stats, geen voordeel.
  // source: { catalogs, project, profile? } (bij een klap van een vijand is er geen request).
  fightProfile(source, playerId, stats, enemyLevel, nowMs) {
    const rules = this.combatRules(source.project);
    const playerLevel = this.levelOfPlayer(playerId);
    const scaled = rules.levelScaling && Number.isFinite(Number(enemyLevel)) && Number(enemyLevel) >= 1;
    const level = scaled ? Math.max(1, Math.round(Number(enemyLevel))) : playerLevel;
    const growth = scaled && level !== playerLevel ? statBlockGrowth(source.catalogs, this.statBlockRefForPlayer(source, playerId)) : null;
    const classStat = (statId, fallback) => {
      const row = stats.byId[statId];
      if (!row) return fallback;
      return growth ? statAtLevel(row.baseValue, growth[statId], level) : row.baseValue + row.earnedValue;
    };
    const gear = this.equipmentBonusesForPlayer(playerId, source.catalogs, scaled ? level : null);
    const bonus = effectBonuses(loadActiveEffects(this.db, playerId, nowMs));
    return {
      scaled, playerLevel, level,
      edgePct: scaled ? levelEdgePct(playerLevel, level, rules.levelDiffPct, rules.levelDiffMaxPct) : 0,
      attackPower: Math.max(0, classStat(ATTACK_POWER_STAT_ID, 10) + gear.attackPower + bonus.attackPower),
      armor: Math.max(0, classStat(ARMOR_STAT_ID, 0) + gear.armor + bonus.armor),
      // De levensbalk op het getelde level en de echte balk: schade wordt hetzelfde deel van de balk.
      healthMax: Math.max(1, classStat(HEALTH_STAT_ID, 1)),
      realHealthMax: Math.max(1, effectiveMaxStat(stats.byId[HEALTH_STAT_ID], 1))
    };
  }

  positionIsSafe(ctx) {
    return Boolean(this.actorRuntime()?.areaIsSafe(ctx.position?.current_area_id || null));
  }

  claimActorReward(ctx, claimKey, instanceId, playerId, operationId, buildId) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO actor_loot_claims (claim_key, world_id, instance_id, player_id, operation_id, build_id, grants_json, claimed_at)
      VALUES (?, ?, ?, ?, ?, ?, '[]', ?)
    `).run(claimKey, ctx.worldId, instanceId, playerId, operationId, buildId || null, now());
    return Number(result.changes) === 1;
  }

  saveActorSpawnState(ctx, spawnKey, occurrence, state, respawnAtMs, buildId) {
    this.db.prepare(`
      INSERT INTO actor_spawn_state (world_id, spawn_key, occurrence, state, respawn_at_ms, build_id, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(world_id, spawn_key) DO UPDATE SET occurrence = excluded.occurrence, state = excluded.state,
        respawn_at_ms = excluded.respawn_at_ms, build_id = excluded.build_id, updated_at = excluded.updated_at
    `).run(ctx.worldId, spawnKey, occurrence, state, respawnAtMs, buildId || null, now());
  }

  // Fase 5: zonder skill = de auto-aanval van de klasse (vak 1); met skill = een vaardigheid van vak 2/3.
  attackActor(ctx, targetId, operationId, skill = null) {
    const runtime = this.actorRuntime();
    if (!runtime) {
      const error = new Error("Vijand niet gevonden.");
      error.status = 404;
      throw error;
    }
    const stats = this.loadPlayerStats(ctx.profile.id);
    const nowMs = Date.now();
    // Fase 6: per vijand-level uitrekenen hoe deze speler telt (de ring kan vijanden van verschillend level raken).
    const fights = new Map();
    const fight = (enemyLevel) => {
      const key = Math.max(1, Math.round(Number(enemyLevel) || 1));
      if (!fights.has(key)) fights.set(key, this.fightProfile(ctx, ctx.profile.id, stats, key, nowMs));
      return fights.get(key);
    };
    // Healing (2-11): een aanval kan mana kosten.
    const ability = skill || playerAbilityFromSection(runtime.ensureBuild(nowMs), ctx.profile.selected_character_id || null);
    const manaCost = Math.max(0, safeInteger(ability.manaCost, 0));
    const manaBefore = statValue(stats.byId, MANA_STAT_ID, 0);
    if (manaCost > 0 && manaBefore < manaCost) throw httpError(409, "Te weinig mana (" + Math.floor(manaBefore) + " / " + manaCost + ").");
    this.vitals()?.markCombat(ctx.profile.id, nowMs);
    const planned = runtime.planPlayerAttack({
      playerId: ctx.profile.id, classId: ctx.profile.selected_character_id || null, targetId, x: safeNumber(ctx.position?.x, 0), z: safeNumber(ctx.position?.z, 0),
      y: Number.isFinite(Number(ctx.position?.y)) ? Number(ctx.position.y) : null,
      safe: this.positionIsSafe(ctx), fight, nowMs: Date.now(), operationId, ability: skill || null
    });
    if (planned.result) return planned.result;
    const plan = planned.plan;
    if (manaCost > 0) this.spendMana(ctx.profile.id, manaBefore, manaCost, operationId, "ability_used", ability.abilityId);
    const events = [];
    // Kevin 10-11: de hoofdvijand plus (bij "Raakt iedereen binnen bereik") de rest in de ring; elk met eigen buit en quest-telling.
    const hits = [plan].concat(Array.isArray(plan.splash) ? plan.splash : []);
    let grants = [];
    for (const hit of hits) grants = grants.concat(this.settleActorHit(ctx, runtime, hit, operationId, events));
    if (manaCost > 0) events.push({ type: "mana", amount: -manaCost });
    const what = skill ? (skill.displayName || "Vaardigheid") + ": " : "";
    return {
      action: skill ? "skill" : "attack",
      targetId: plan.instanceId,
      performed: true,
      abilityId: plan.abilityId,
      cooldownMs: Math.max(100, safeInteger(ability.cooldownMs, 1500)),
      stop: plan.killed,
      message: what + (plan.killed ? plan.label + " verslagen." : plan.label + " geraakt voor " + plan.damage + "."
        + (plan.shieldBreak ? " Schild gebroken!" : plan.shieldUp ? " (schild)" : ""))
        + (hits.length > 1 ? " +" + (hits.length - 1) + " in de buurt geraakt." : ""),
      hitCount: hits.length,
      events,
      grants
    };
  }

  // Eén geraakte vijand afhandelen: verslagen = buit en XP voor wie meevocht (1x per vijand-leven), plek opslaan, quests tellen.
  // Geeft wat deze speler kreeg terug.
  settleActorHit(ctx, runtime, plan, operationId, events) {
    events.push({ type: "damage", amount: plan.damage, targetId: plan.instanceId, label: plan.label });
    if (!plan.killed) {
      this.recordGameplayEvent(ctx, "actor_hit", "player", plan.instanceId, { damage: plan.damage, healthAfter: plan.hpAfter });
      return [];
    }
    let grants = [];
    events.push({ type: "defeated", targetId: plan.instanceId, label: plan.label });
    // Persoonlijke loot voor iedereen die meevocht: één claim per vijand-leven per speler (UNIQUE claim_key).
    for (const reward of plan.rewards) {
      const rewardCtx = reward.playerId === ctx.profile.id ? ctx : Object.assign({}, ctx, { profile: { id: reward.playerId } });
      if (!this.claimActorReward(ctx, reward.claimKey, plan.instanceId, reward.playerId, operationId, plan.buildId)) continue;
      const given = [];
      // Fase 8 herstel 2: zonder Automatisch buit pakken ligt de buit eerst klaar in het buitvenster (XP krijg je meteen).
      if (this.autoLootFor(reward.playerId)) {
        for (const item of reward.items) given.push(...this.grantLootRow(rewardCtx, item, "actor_defeated", plan.instanceId, operationId));
      } else {
        this.holdLoot(ctx, reward.playerId, "enemy", plan.instanceId, plan.label, reward.items, "actor_defeated", operationId, { x: plan.x, z: plan.z });
      }
      const xp = reward.xp > 0 ? this.grantXpAmount(rewardCtx, reward.xp, "actor_defeated", plan.instanceId, operationId) : null;
      if (xp) given.push(xp);
      this.db.prepare("UPDATE actor_loot_claims SET grants_json = ? WHERE claim_key = ?").run(stableJson(given), reward.claimKey);
      if (reward.playerId === ctx.profile.id) grants = given;
    }
    // Een quest-vijand (stap 5) komt niet terug; die bewaart de vijandenserver zelf.
    if (!plan.questSpawn) this.saveActorSpawnState(ctx, plan.spawnKey, plan.occurrence, "dead", plan.respawnAtMs, plan.buildId);
    this.recordGameplayEvent(ctx, "actor_defeated", "player", plan.instanceId, { damage: plan.damage, grants });
    // Quest Builder: de kill telt voor iedereen die meevocht (1x per vijand-leven per speler).
    // Stap 5: bij een quest-vijand welke verschijning het was, en alleen wie hem mag zien telt mee.
    const spawn = plan.questSpawn || null;
    this.questEvents?.(ctx, plan.rewards.map((reward) => reward.playerId),
      { type: "defeat", refId: plan.actorId, eventKey: "defeat:" + plan.instanceId, operationId, at: { x: plan.x, z: plan.z },
        spawn, canSee: spawn ? (playerId) => runtime.canSeeGroupId(spawn.groupId, playerId) : null });
    return grants;
  }

  gatherResource(ctx, targetId, operationId) {
    const runtime = this.actorRuntime();
    if (!runtime) {
      const error = new Error("Grondstof niet gevonden.");
      error.status = 404;
      throw error;
    }
    const planned = runtime.planGather({ playerId: ctx.profile.id, targetId, x: safeNumber(ctx.position?.x, 0), z: safeNumber(ctx.position?.z, 0), nowMs: Date.now(), operationId });
    if (planned.result) return planned.result;
    const plan = planned.plan;
    // Gedeelde grondstof: wie het eerst verzamelt, krijgt het (claim per grondstof-leven).
    if (!this.claimActorReward(ctx, plan.claimKey, plan.instanceId, ctx.profile.id, operationId, plan.buildId)) {
      plan.claimed = false;
      return { action: "gather", targetId: plan.instanceId, message: plan.label + " is al verzameld.", events: [] };
    }
    const grants = [];
    // Fase 8 herstel 2: zonder Automatisch buit pakken ligt de opbrengst eerst klaar in het buitvenster.
    const held = this.autoLootFor(ctx.profile.id) ? null : this.holdLoot(ctx, ctx.profile.id, "resource", plan.instanceId, plan.label, plan.items, "resource_gathered", operationId, { x: plan.x, z: plan.z });
    if (!held) for (const item of plan.items) grants.push(...this.grantLootRow(ctx, item, "resource_gathered", plan.instanceId, operationId));
    this.db.prepare("UPDATE actor_loot_claims SET grants_json = ? WHERE claim_key = ?").run(stableJson(grants), plan.claimKey);
    // Stap 5: Ieder zijn eigen = alleen voor jou weg (in het geheugen), niet voor iedereen.
    if (!plan.personal) this.saveActorSpawnState(ctx, plan.spawnKey, plan.occurrence, "depleted", plan.respawnAtMs, plan.buildId);
    this.recordGameplayEvent(ctx, "resource_gathered", "player", plan.instanceId, { grants });
    this.questEvents?.(ctx, [ctx.profile.id], { type: "gather", refId: plan.resourceId, eventKey: "gather:" + (plan.eventKey || plan.instanceId), operationId, at: { x: plan.x, z: plan.z } });
    return {
      action: "gather",
      targetId: plan.instanceId,
      message: plan.label + " verzameld.",
      events: [{ type: "gathered", targetId: plan.instanceId, label: plan.label }],
      grants
    };
  }

  spendMana(playerId, before, cost, operationId, reason, sourceRef) {
    const after = Math.max(0, before - cost);
    this.db.prepare("UPDATE player_stats SET current_value = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND stat_id = ?")
      .run(after, now(), playerId, MANA_STAT_ID);
    this.recordLedger(operationId, playerId, "stat", MANA_STAT_ID, after - before, before, after, reason, sourceRef || null);
    return after;
  }

  // Healing (2-11): de genees-spreuk van je klasse (💚-knop). Zonder doel kiest de server de meest gewonde speler
  // binnen het bereik (jij of een ander). Kost mana, heeft een wachttijd en kan een effect geven (genezing over tijd).
  // Fase 5: skill = de genees-vaardigheid van vak 2/3 (useSkill controleert slot, vergrendeling en wachttijd). Zonder skill
  // (oude "heal"-actie, tik op een teamlid) de eerste genees-vaardigheid die op vak 2 of 3 staat.
  healTarget(ctx, payload, operationId, skill = null) {
    const runtime = this.actorRuntime();
    const nowMs = Date.now();
    let ability = skill;
    if (!ability) {
      const spell = this.healSpellForHud(ctx);
      if (!spell) throw httpError(409, "Je hebt geen genees-spreuk op vak 2 of 3.");
      return this.useSkill(ctx, Object.assign({}, payload, { slot: spell.slot }), operationId);
    }
    const stats = this.loadPlayerStats(ctx.profile.id);
    const manaCost = Math.max(0, safeInteger(ability.manaCost, 0));
    const manaBefore = statValue(stats.byId, MANA_STAT_ID, 0);
    if (manaCost > 0 && manaBefore < manaCost) throw httpError(409, "Te weinig mana (" + Math.floor(manaBefore) + " / " + manaCost + ").");
    // Wie staat er binnen bereik? Jij zelf altijd; anderen alleen online, in deze wereld en niet verslagen.
    const rangeM = Math.max(0.5, safeNumber(ability.rangeMm, 2000) / 1000) + 0.8;
    const myX = safeNumber(ctx.position?.x, 0);
    const myZ = safeNumber(ctx.position?.z, 0);
    const candidates = [{ id: ctx.profile.id, self: true }];
    let states = [];
    try { states = this.mmoService.getWorldPlayerStates(ctx.worldId) || []; } catch {}
    for (const state of states) {
      const id = state?.player_id;
      if (!id || id === ctx.profile.id || candidates.some((entry) => entry.id === id)) continue;
      if (typeof this.mmoService.getConnectionForPlayer === "function" && !this.mmoService.getConnectionForPlayer(id, ctx.worldId)) continue;
      if (Math.hypot(safeNumber(state.x, 0) - myX, safeNumber(state.z, 0) - myZ) > rangeM) continue;
      candidates.push({ id, self: false });
    }
    const healthOf = (id) => {
      const rows = id === ctx.profile.id ? stats.byId : this.loadPlayerStats(id).byId;
      const max = effectiveMaxStat(rows[HEALTH_STAT_ID], 0);
      return { max, current: statValue(rows, HEALTH_STAT_ID, max) };
    };
    // Fase 5: een aangeklikte vijand is geen doel voor genezen; dan kiest de server zelf.
    const rawWanted = safeString(payload.targetId, "");
    const wanted = rawWanted.startsWith("player:") ? rawWanted.slice(7) : (rawWanted && !rawWanted.includes(":") ? rawWanted : "");
    let target = null;
    let targetHealth = null;
    for (const candidate of candidates) {
      const health = healthOf(candidate.id);
      if (health.max <= 0 || health.current <= 0) continue;
      if (wanted && candidate.id === wanted) { target = candidate; targetHealth = health; break; }
      if (health.current >= health.max) continue;
      const pct = health.current / health.max;
      if (!target || pct < targetHealth.current / targetHealth.max || (pct === targetHealth.current / targetHealth.max && candidate.self)) {
        target = candidate;
        targetHealth = health;
      }
    }
    // MMO (3-11): een gekozen teamlid (tik linksboven) dat te ver weg of verslagen is: zeggen, niet stilletjes iemand anders genezen.
    if (wanted && wanted !== ctx.profile.id && target?.id !== wanted) {
      let name = "Die speler";
      try { name = this.db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(wanted)?.display_name || name; } catch {}
      throw httpError(409, candidates.some((entry) => entry.id === wanted) ? name + " is verslagen." : name + " is te ver weg om te genezen.");
    }
    const effect = effectFromSource(ability, ability.displayName || "Genezing");
    if (!target && effect) { target = candidates[0]; targetHealth = healthOf(ctx.profile.id); }
    if (!target) throw httpError(409, candidates.length > 1 ? "Iedereen in de buurt heeft volle levens." : "Niemand in bereik om te genezen.");
    // Fase 5: genezen gaat niet door een muur (alleen bij een ander; jezelf kan altijd).
    if (!target.self) {
      const other = states.find((state) => state?.player_id === target.id);
      if (other && runtime?.lineBlocked(myX, myZ, safeNumber(other.x, 0), safeNumber(other.z, 0), Number.isFinite(Number(ctx.position?.y)) ? Number(ctx.position.y) : null)) {
        throw httpError(409, "Er zit iets tussen jou en die speler.", "NO_LINE_OF_SIGHT");
      }
    }
    const bonus = effectBonuses(loadActiveEffects(this.db, ctx.profile.id, nowMs));
    let amount = computeHeal(ability, effectiveMaxStat(stats.byId[HEAL_POWER_STAT_ID], 0) + bonus.healPower);
    if (!target.self) {
      // Fase 6: een genezing vult bij een ander hetzelfde deel van de balk als bij iemand van je eigen level
      // (schaling aan: het doel telt als het level van de genezer). En wie een vechtende speler geneest, doet zelf mee.
      if (this.combatRules(ctx.project).levelScaling) {
        const targetRow = this.loadPlayerStats(target.id).byId[HEALTH_STAT_ID];
        const myLevel = this.levelOfPlayer(ctx.profile.id);
        if (targetRow && myLevel !== this.levelOfPlayer(target.id)) {
          const growth = statBlockGrowth(ctx.catalogs, this.statBlockRefForPlayer(ctx, target.id));
          amount = toRealPool(amount, targetHealth.max, Math.max(1, statAtLevel(targetRow.baseValue, growth[HEALTH_STAT_ID], myLevel)));
        }
      }
      runtime?.creditHelper?.(ctx.profile.id, target.id);
    }
    const after = Math.min(targetHealth.max, targetHealth.current + amount);
    const healed = Math.round(after - targetHealth.current);
    if (healed > 0) {
      this.db.prepare("UPDATE player_stats SET current_value = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND stat_id = ?")
        .run(after, now(), target.id, HEALTH_STAT_ID);
      this.recordLedger(operationId, target.id, "stat", HEALTH_STAT_ID, healed, targetHealth.current, after, "healed_by_player", ctx.profile.id);
    }
    if (effect) applyEffect(this.db, target.id, { sourceKind: "ability", sourceId: ability.abilityId, effect }, nowMs, this.combatRules(ctx.project));
    if (manaCost > 0) this.spendMana(ctx.profile.id, manaBefore, manaCost, operationId, "ability_used", ability.abilityId);
    this.recordGameplayEvent(ctx, "player_healed", "player", target.id, { amount: healed, abilityId: ability.abilityId });
    // Getallen: groen boven wie geneest wordt (iedereen in de buurt ziet het), blauw voor je eigen mana.
    // Fase 5: met de vaardigheid erbij, zodat iedereen in de buurt ook de animatie (spreuk-gloed) ziet.
    this.broadcastFx(ctx.worldId, { target: target.id, by: ctx.profile.id, amount: healed, tone: "heal", x: myX, z: myZ, ab: ability.abilityId });
    if (!target.self) {
      const vitals = this.vitals();
      if (vitals) setTimeout(() => { try { vitals.push(target.id, ctx.worldId, Date.now(), null, [], true); } catch {} }, 0);
    }
    let who = "jezelf";
    if (!target.self) {
      try { who = this.db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(target.id)?.display_name || "een andere speler"; } catch { who = "een andere speler"; }
    }
    return {
      action: "heal",
      targetId: target.id,
      performed: true,
      abilityId: ability.abilityId,
      message: (ability.displayName || "Genezen") + ": " + who + " +" + healed + " levens" + (effect ? " (" + effect.name + ")" : "") + ".",
      events: [{ type: "healed", targetId: target.id, amount: healed }].concat(manaCost > 0 ? [{ type: "mana", amount: -manaCost }] : []),
      cooldownMs: Math.max(100, safeInteger(ability.cooldownMs, 1500)),
      grants: []
    };
  }

  // Een vijand raakt een speler (aangeroepen vanuit de worldtick). Eigen kleine transactie; schade met dezelfde rekenregel.
  // Fase 6: level = het level van de vijand. Met schaling telt de speler als dat level (pantser op dat level), en de schade
  // wordt hetzelfde deel van zijn echte levensbalk; een hoger level krijgt iets minder, een lager level iets meer (schuifje).
  applyActorHit({ worldId, playerId, actorId, label, ability, attackPower, level = null }) {
    const stats = this.loadPlayerStats(playerId);
    if (!stats.byId[HEALTH_STAT_ID]) return null;
    const before = statValue(stats.byId, HEALTH_STAT_ID, 1);
    if (before <= 0) return { damage: 0, remainingHealth: 0, defeated: true };
    let catalogs = {};
    let project = {};
    try {
      const world = this.mmoService.getPublishedWorldContext().world;
      catalogs = resolveCatalogs(world);
      project = resolveProject(world);
    } catch {}
    const nowMs = Date.now();
    const fight = this.fightProfile({ catalogs, project }, playerId, stats, level, nowMs);
    let damage = computeDamage(ability, attackPower, fight.armor);
    if (fight.scaled) {
      if (fight.edgePct) damage = Math.max(1, Math.round(damage * (100 - fight.edgePct) / 100));
      damage = toRealPool(damage, fight.realHealthMax, fight.healthMax);
    }
    this.vitals()?.markCombat(playerId, nowMs);
    const rules = this.combatRules(project);
    const after = Math.max(0, before - damage);
    const operationId = randomId("actor_hit");
    const ctx = { worldId, zoneId: null, profile: { id: playerId } };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`
        UPDATE player_stats SET current_value = ?, revision = revision + 1, updated_at = ?
        WHERE player_id = ? AND stat_id = ?
      `).run(after, now(), playerId, HEALTH_STAT_ID);
      this.recordLedger(operationId, playerId, "stat", HEALTH_STAT_ID, -damage, before, after, "actor_attack", actorId);
      if (after <= 0) {
        this.recordGameplayEvent(ctx, "player_defeated", actorId, "player", { damage, label });
        clearEffectsForDeath(this.db, playerId, rules);
      } else {
        // Healing (2-11): gif of bloeden van de vijand-aanval komt op de speler.
        const effect = effectFromSource(ability, ability?.displayName || label);
        if (effect) applyEffect(this.db, playerId, { sourceKind: "ability", sourceId: ability.abilityId || label, effect }, nowMs, rules);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
    if (after <= 0 && this.mmoService && typeof this.mmoService.stopPlayerForDefeat === "function") {
      this.mmoService.stopPlayerForDefeat(playerId, worldId);
    }
    return { damage, remainingHealth: after, defeated: after <= 0 };
  }

  recordLedger(operationId, playerId, assetKind, assetId, delta, before, after, reason, sourceRef) {
    this.db.prepare(`
      INSERT INTO economy_ledger (id, operation_id, player_id, asset_kind, asset_id, delta_real, before_real, after_real, reason, source_ref, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)
    `).run(randomId("ledger"), operationId, playerId, assetKind, assetId, delta, before, after, reason, sourceRef || null, now());
  }

  recordGameplayEvent(ctx, eventType, sourceId, targetId, payload) {
    this.db.prepare(`
      INSERT INTO gameplay_events (id, dedupe_key, world_id, zone_id, player_id, event_type, source_id, target_id, payload_json, occurred_at)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("event"), ctx.worldId, ctx.zoneId, ctx.profile.id, eventType, sourceId || null, targetId || null, stableJson(payload || {}), now());
  }

  buildSnapshot(ctx) {
    const progression = this.loadProgression(ctx);
    const stats = this.loadPlayerStats(ctx.profile.id);
    const inventory = this.loadInventory(ctx);
    const currencies = this.loadCurrencies(ctx);
    const equipment = this.loadEquipment(ctx);
    const entities = this.loadEntities(ctx);
    const modules = uiModules(ctx.project);
    return {
      ok: true,
      schemaVersion: "node03-runtime-v1",
      debugActionsAllowed: developerActionsAllowed(ctx),
      // Stap 4 (HUD): de prestatie/MMO-info is alleen voor een admin-account.
      viewer: { isAdmin: ctx.sessionContext?.user?.role === "admin" },
      worldId: ctx.worldId,
      zoneId: ctx.zoneId,
      zoneName: ctx.zonePackage?.zone?.displayName || ctx.zoneId,
      playerId: ctx.profile.id,
      characterId: ctx.profile.selected_character_id || null,
      position: this.mmoService.publicPositionForPlayer(ctx.position, ctx.sessionContext.session, ctx.worldId),
      progression,
      stats,
      currencies,
      inventory,
      equipment,
      // Fase 5: vak 1 (auto-aanval), de vaardigheden van je klasse en de indeling van vak 2 en 3.
      skills: this.skillsForHud(ctx),
      catalog: this.loadHudCatalog(ctx),
      // Healing (2-11): actieve effecten, wachttijd per item en de genees-spreuk (💚-knop).
      effects: publicEffects(loadActiveEffects(this.db, ctx.profile.id, Date.now()), Date.now()),
      itemCooldowns: itemCooldowns(this.db, ctx.profile.id, Date.now()),
      healSpell: this.healSpellForHud(ctx),
      // Portals (8-11): welke portals je ziet, welke vrij zijn, kosten en wachttijd.
      portals: this.portalSnapshot(ctx),
      // Fase 8 herstel 2: wat er klaarligt in het buitvenster.
      loot: this.lootForHud(ctx),
      entities,
      interactionTargets: this.buildInteractionTargets(ctx, entities),
      ui: {
        modules,
        moduleCount: modules.length,
        interactionHud: interactionHudConfig(ctx.project),
        minimap: ctx.world?.minimap?.game || null
      },
      generatedAt: now()
    };
  }

  // ---- Fase 5: vaardigheden (vak 1 auto-aanval, vak 2 en 3 zelf in te delen) ------------------------------------

  // De naam van een vaardigheid uit de actieve build (voor quest-meldingen).
  abilityDisplayName(abilityId) {
    try {
      const section = this.actorRuntime()?.ensureBuild(Date.now());
      return section?.abilities?.[abilityId]?.displayName || null;
    } catch {
      return null;
    }
  }

  // Alles wat nodig is om te weten wat een character mag: klasse, level, geleerde vaardigheden en de indeling van vak 2 en 3.
  skillState(ctx, section = null) {
    const runtime = this.actorRuntime();
    const build = section || (runtime ? runtime.ensureBuild(Date.now()) : null);
    const classId = ctx.profile.selected_character_id || null;
    const level = Math.max(1, safeInteger(this.db.prepare("SELECT level FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id)?.level, 1));
    const learned = new Set(this.db.prepare("SELECT ability_id FROM player_abilities WHERE player_id = ?").all(ctx.profile.id).map((row) => row.ability_id));
    const skillIds = classSkillIdsFromSection(build, classId);
    const lockOf = (abilityId) => {
      const ability = build?.abilities?.[abilityId];
      if (!ability) return "bestaat niet meer";
      if (ability.unlockQuest === true && !learned.has(abilityId)) return "quest";
      const need = Math.max(1, safeInteger(ability.unlockLevel, 1));
      return level < need ? "level" : null;
    };
    const usable = skillIds.filter((id) => !lockOf(id));
    const rows = this.db.prepare("SELECT slot_index, ability_id FROM player_ability_loadouts WHERE player_id = ? AND loadout_id = ?").all(ctx.profile.id, HOTBAR_LOADOUT_ID);
    const stored = new Map(rows.map((row) => [safeInteger(row.slot_index, 0), row.ability_id || null]));
    const slots = {};
    for (const slot of SKILL_SLOTS) {
      const id = stored.has(slot) ? stored.get(slot) : null;
      slots[slot] = id && usable.includes(id) ? id : null;
    }
    // Nooit iets ingedeeld op vak 2: de eerste vaardigheid die vrij is (bestaande Healers: hun genees-spreuk).
    if (!stored.has(2) && !slots[2]) slots[2] = usable.find((id) => id !== slots[3]) || null;
    return { build, classId, level, learned, skillIds, usable, lockOf, slots };
  }

  skillReadyInMs(playerId, abilityId, nowMs = Date.now()) {
    return Math.max(0, (this.skillReadyAt?.get(playerId + "|" + abilityId) || 0) - nowMs);
  }

  // Waarom een vaardigheid nog op slot zit, in gewone woorden.
  lockText(state, abilityId) {
    const lock = state.lockOf(abilityId);
    const ability = state.build?.abilities?.[abilityId] || {};
    if (lock === "level") return "vanaf level " + Math.max(1, safeInteger(ability.unlockLevel, 1));
    if (lock === "quest") {
      const quests = Array.isArray(ability.fromQuests) ? ability.fromQuests.filter(Boolean) : [];
      return quests.length ? "na quest " + quests.map((name) => "\u201c" + name + "\u201d").join(" of ") : "na een quest";
    }
    return lock || null;
  }

  // Een vaardigheid van vak 2 of 3 gebruiken. De server controleert vak, vergrendeling, wachttijd, mana, bereik en muur.
  useSkill(ctx, payload, operationId) {
    const slot = safeInteger(payload.slot, 0);
    if (!SKILL_SLOTS.includes(slot)) throw httpError(400, "Kies vak 2 of 3.", "SLOT_INVALID");
    const state = this.skillState(ctx);
    const abilityId = state.slots[slot];
    if (!abilityId) {
      const stored = this.db.prepare("SELECT ability_id FROM player_ability_loadouts WHERE player_id = ? AND loadout_id = ? AND slot_index = ? LIMIT 1").get(ctx.profile.id, HOTBAR_LOADOUT_ID, slot)?.ability_id;
      if (stored && state.skillIds.includes(stored)) throw httpError(409, "Vergrendeld: " + this.lockText(state, stored) + ".", "SKILL_LOCKED");
      throw httpError(409, "Vak " + slot + " is leeg. Sleep een vaardigheid uit het 📖 boek.", "SLOT_EMPTY");
    }
    const ability = abilityFromSection(state.build, abilityId);
    const nowMs = Date.now();
    const waitMs = this.skillReadyInMs(ctx.profile.id, abilityId, nowMs);
    if (waitMs > 0) return { action: "skill", slot, abilityId, message: "Nog even wachten.", cooldownMs: waitMs, events: [] };
    const result = ability.abilityKind === "heal"
      ? this.healTarget(ctx, payload, operationId, ability)
      : this.attackActor(ctx, this.skillTarget(ctx, payload, ability), operationId, ability);
    if (result?.performed) {
      if (!this.skillReadyAt) this.skillReadyAt = new Map();
      this.skillReadyAt.set(ctx.profile.id + "|" + abilityId, nowMs + Math.max(100, safeInteger(ability.cooldownMs, 1500)));
    }
    return Object.assign({}, result, { action: "skill", slot, abilityId, cooldownMs: Math.max(100, safeInteger(ability.cooldownMs, 1500)) });
  }

  // Doel van een aanval-vaardigheid: de gekozen vijand, anders de dichtstbijzijnde binnen bereik.
  skillTarget(ctx, payload, ability) {
    const wanted = safeString(payload.targetId, "");
    if (wanted && isActorInstanceId(wanted)) return wanted;
    const id = this.actorRuntime()?.nearestEnemy(ctx.profile.id, safeNumber(ctx.position?.x, 0), safeNumber(ctx.position?.z, 0), safeInteger(ability.rangeMm, 2000));
    if (!id) throw httpError(409, "Geen vijand in de buurt.", "NO_TARGET");
    return id;
  }

  // Een vaardigheid op vak 2 of 3 zetten (of het vak leegmaken). Alleen wat bij je klasse hoort en vrij is.
  setLoadoutSlot(ctx, payload) {
    const slot = safeInteger(payload.slot, 0);
    if (!SKILL_SLOTS.includes(slot)) throw httpError(400, "Kies vak 2 of 3.", "SLOT_INVALID");
    const abilityId = safeString(payload.abilityId, "") || null;
    const state = this.skillState(ctx);
    if (abilityId) {
      if (!state.skillIds.includes(abilityId)) throw httpError(409, "Deze vaardigheid hoort niet bij je klasse.", "SKILL_NOT_IN_CLASS");
      if (state.lockOf(abilityId)) throw httpError(409, "Vergrendeld: " + this.lockText(state, abilityId) + ".", "SKILL_LOCKED");
    }
    const upsert = this.db.prepare(`
      INSERT INTO player_ability_loadouts (player_id, loadout_id, slot_index, ability_id, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_id, loadout_id, slot_index) DO UPDATE SET ability_id = excluded.ability_id, updated_at = excluded.updated_at
    `);
    const stamp = now();
    const other = slot === 2 ? 3 : 2;
    // Stond hij al op het andere vak: wisselen (het andere vak krijgt wat hier stond).
    if (abilityId && state.slots[other] === abilityId) upsert.run(ctx.profile.id, HOTBAR_LOADOUT_ID, other, state.slots[slot] || null, stamp);
    else if (!state.slots[other]) upsert.run(ctx.profile.id, HOTBAR_LOADOUT_ID, other, null, stamp);
    upsert.run(ctx.profile.id, HOTBAR_LOADOUT_ID, slot, abilityId, stamp);
    const name = abilityId ? (state.build?.abilities?.[abilityId]?.displayName || abilityId) : null;
    return { action: "loadout_set", slot, abilityId, message: name ? name + " staat op vak " + slot + "." : "Vak " + slot + " is leeg." };
  }

  // Wat de game nodig heeft: de auto-aanval, de vaardigheden van je klasse (met slot-reden) en de indeling.
  skillsForHud(ctx) {
    try {
      const state = this.skillState(ctx);
      const nowMs = Date.now();
      const view = (abilityId) => {
        const ability = state.build?.abilities?.[abilityId] || {};
        return { abilityId, displayName: ability.displayName || abilityId, kind: ability.abilityKind === "heal" ? "heal" : "damage",
          icon: ability.icon || null, manaCost: safeInteger(ability.manaCost, 0), cooldownMs: Math.max(100, safeInteger(ability.cooldownMs, 1500)),
          rangeM: safeNumber(ability.rangeMm, 2000) / 1000, animStyle: ability.animStyle || "slash" };
      };
      const auto = playerAbilityFromSection(state.build, state.classId);
      return {
        auto: Object.assign(view(auto.abilityId), { displayName: auto.displayName || "Aanval", cooldownMs: Math.max(100, safeInteger(auto.cooldownMs, 1500)),
          rangeM: safeNumber(auto.rangeMm, 2000) / 1000, icon: auto.icon || null, manaCost: safeInteger(auto.manaCost, 0) }),
        slots: { 2: state.slots[2], 3: state.slots[3] },
        list: state.skillIds.map((abilityId) => Object.assign(view(abilityId), {
          unlocked: !state.lockOf(abilityId), lock: state.lockOf(abilityId), lockText: this.lockText(state, abilityId),
          unlockLevel: Math.max(1, safeInteger(state.build?.abilities?.[abilityId]?.unlockLevel, 1)),
          readyInMs: this.skillReadyInMs(ctx.profile.id, abilityId, nowMs)
        })),
        level: state.level
      };
    } catch {
      return { auto: null, slots: { 2: null, 3: null }, list: [], level: 1 };
    }
  }

  // Healing (2-11) / Fase 5: de genees-vaardigheid op vak 2 of 3 (voor de tik op een teamlid), of null.
  healSpellForHud(ctx) {
    try {
      const state = this.skillState(ctx);
      for (const slot of SKILL_SLOTS) {
        const ability = abilityFromSection(state.build, state.slots[slot]);
        if (!ability || ability.abilityKind !== "heal") continue;
        return { abilityId: ability.abilityId, displayName: ability.displayName || "Genezen", manaCost: safeInteger(ability.manaCost, 0),
          rangeM: safeNumber(ability.rangeMm, 2000) / 1000, cooldownMs: safeInteger(ability.cooldownMs, 1500), slot };
      }
      return null;
    } catch {
      return null;
    }
  }

  // ---- Fase 5: maker-gereedschap (alleen een admin-account, zoals 🧪 Testen in de Quest Builder) -------------------

  assertMaker(ctx) {
    if (ctx?.sessionContext?.user?.role === "admin") return;
    throw httpError(403, "Alleen voor de maker (admin-account).", "MAKER_ONLY");
  }

  makerSetLevel(ctx, payload, operationId) {
    this.assertMaker(ctx);
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const maxLevel = Math.max(1, safeInteger(progressionPolicy.maxLevel, 10));
    const level = Math.max(1, Math.min(maxLevel, safeInteger(payload.level, 1)));
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id) || {};
    const beforeXp = safeInteger(row.xp, 0);
    const xp = xpForLevel(ctx.catalogs, curveRef, level);
    this.db.prepare("UPDATE player_progression SET level = ?, xp = ?, revision = revision + 1, updated_at = ? WHERE player_id = ?").run(level, xp, now(), ctx.profile.id);
    if (xp !== beforeXp) this.recordLedger(operationId, ctx.profile.id, "xp", "xp", xp - beforeXp, beforeXp, xp, "maker_level", "maker");
    // Fase 6: de stats horen bij het level (ook omlaag, zodat de maker elk level kan uitproberen).
    const beforeLevel = Math.max(1, safeInteger(row.level, 1));
    if (level !== beforeLevel) this.levelChanged(ctx, ctx.profile.id, beforeLevel, level);
    return { action: "maker_level", level, xp, message: "Maker: level " + level + (level === maxLevel ? " (hoogste level)" : "") + "." };
  }

  makerGiveXp(ctx, payload, operationId) {
    this.assertMaker(ctx);
    const amount = Math.max(1, Math.min(1000000, safeInteger(payload.xp ?? payload.amount, 100)));
    const grant = this.grantXpAmount(ctx, amount, "maker_xp", "maker", operationId);
    return { action: "maker_xp", grants: [grant].filter(Boolean), message: "Maker: +" + amount + " XP" + (grant && grant.afterLevel > grant.beforeLevel ? " → level " + grant.afterLevel + "!" : ".") };
  }


  loadProgression(ctx) {
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id) || {};
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const level = safeInteger(row.level, 1);
    const xp = safeInteger(row.xp, 0);
    const currentLevelXp = xpForLevel(ctx.catalogs, curveRef, level);
    const nextLevelXp = xpForLevel(ctx.catalogs, curveRef, level + 1);
    const span = Math.max(1, nextLevelXp - currentLevelXp);
    // Fase 6: wat deze klasse er per level bij krijgt (voor de level-up melding) en het hoogste level.
    const growth = statBlockGrowth(ctx.catalogs, this.statBlockRefForPlayer(ctx, ctx.profile.id));
    return {
      level,
      xp,
      maxLevel: Math.max(1, safeInteger(progressionPolicy.maxLevel, 10)),
      perLevel: { health: growth[HEALTH_STAT_ID] || 0, attackPower: growth[ATTACK_POWER_STAT_ID] || 0, armor: growth[ARMOR_STAT_ID] || 0,
        mana: growth[MANA_STAT_ID] || 0, healPower: growth[HEAL_POWER_STAT_ID] || 0 },
      skillPoints: safeInteger(row.skill_points, 0),
      currentLevelXp,
      nextLevelXp,
      requiredXp: nextLevelXp,
      progressPercent: clamp((xp - currentLevelXp) / span, 0, 1)
    };
  }

  loadPlayerStats(playerId) {
    const rows = this.db.prepare("SELECT * FROM player_stats WHERE player_id = ? ORDER BY stat_id ASC").all(playerId);
    const byId = {};
    for (const row of rows) {
      byId[row.stat_id] = {
        statId: row.stat_id,
        baseValue: safeNumber(row.base_value, 0),
        earnedValue: safeNumber(row.earned_value, 0),
        currentValue: row.current_value === null || row.current_value === undefined ? null : safeNumber(row.current_value, 0),
        revision: safeInteger(row.revision, 1)
      };
    }
    const health = byId[HEALTH_STAT_ID];
    const mana = byId[MANA_STAT_ID];
    return {
      byId,
      health: this.statSummary(health),
      mana: this.statSummary(mana),
      armor: this.statSummary(byId[ARMOR_STAT_ID]),
      attackPower: this.statSummary(byId[ATTACK_POWER_STAT_ID])
    };
  }

  statSummary(row) {
    const max = effectiveMaxStat(row, 0);
    const current = row?.currentValue === null || row?.currentValue === undefined ? max : safeNumber(row.currentValue, max);
    return { current, max, percent: max > 0 ? clamp(current / max, 0, 1) : 0 };
  }

  loadCurrencies(ctx) {
    return this.db.prepare("SELECT * FROM player_currencies WHERE player_id = ? ORDER BY currency_id ASC").all(ctx.profile.id).map((row) => ({
      currencyId: row.currency_id,
      displayName: displayForCurrency(ctx.catalogs, row.currency_id),
      amountMinor: safeInteger(row.amount_minor, 0),
      revision: safeInteger(row.revision, 1)
    }));
  }

  loadHudCatalog(ctx) {
    const slots = catalogSection(ctx.catalogs, "equipmentSlots");
    // Quest Builder stap 4 + Kevin 5-11: een item dat een quest start opent bij een klik in de tas meteen het gesprek
    // met de brief (verhaal, plaatje, doelen) en de knop Quest accepteren.
    const reads = new Map();
    for (const quest of Object.values(ctx.project?.campaigns?.quests?.byId || {})) {
      if (quest?.startMode !== "item" || !quest.startItemRef || reads.has(quest.startItemRef)) continue;
      const first = (Array.isArray(quest.steps) ? quest.steps : []).find((step) => step?.kind !== "end") || null;
      reads.set(quest.startItemRef, { questId: quest.id, displayName: quest.displayName || quest.id, description: quest.description || "", imageAssetId: quest.imageAssetId || null,
        goals: (Array.isArray(first?.objectives) ? first.objectives : []).filter((objective) => objective?.role !== "hidden").map((objective) => objective.displayName).filter(Boolean).slice(0, 8) });
    }
    const items = Object.values(catalogSection(ctx.catalogs, "items")).map(function (item) {
      return {
        itemId: item.id,
        displayName: item.displayName || item.id,
        category: item.category || null,
        rarity: item.rarity || null,
        stackable: item.stackable !== false,
        // Echte uitrusting blijft per exemplaar in de database; deze vlag groepeert alleen exact gelijke exemplaren in de tas.
        groupIdentical: item.visualStackable === true || item.stackable !== false,
        // Fase 8 herstel: alles wat je mag ruilen mag ook op de markt.
        marketEligible: item.marketEligible !== false,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : [],
        // Stap 4 (HUD): plaatje in de tas en de knoppen Uitrusten / Gebruiken / Weggooien.
        iconAssetId: item.iconAssetId || null,
        modelAssetId: item.worldModelAssetId || null,
        equipSlot: item.equipmentSlotRef && slots[item.equipmentSlotRef] ? item.equipmentSlotRef : null,
        healAmount: safeInteger(item.healAmount, 0),
        useCooldownS: safeInteger(item.useCooldownS, 0),
        effect: (function () {
          const effect = effectFromSource(item, item.displayName || item.id);
          return effect ? { name: effect.name, iconAssetId: effect.iconAssetId, durationMs: effect.durationMs, lines: describeEffect(effect) } : null;
        })(),
        attackPowerBonus: safeInteger(item.attackPowerBonus, 0),
        requiredLevel: Math.max(1, safeInteger(item.requiredLevel, 1)),
        armorBonus: safeInteger(item.armorBonus, 0),
        questItem: item.questItem === true || item.category === "quest",
        // Fase 8b: de tas laat Aanbieden alleen zien bij iets dat je mag ruilen.
        tradable: item.tradable !== false && item.bindPolicy !== "quest_bound" && item.questItem !== true && item.category !== "quest",
        readable: reads.has(item.id),
        reads: reads.get(item.id) || null,
        vendorValue: safeInteger(item.vendorBaseValueMinor, 0)
      };
    }).filter(function (item) {
      return Boolean(item.itemId);
    }).sort(function (left, right) {
      return String(left.displayName || left.itemId).localeCompare(String(right.displayName || right.itemId));
    });
    const currencies = Object.values(catalogSection(ctx.catalogs, "currencies")).map(function (currency) {
      return {
        currencyId: currency.id,
        displayName: currency.displayName || currency.id,
        showInPrimaryWallet: currency.showInPrimaryWallet !== false,
        sortOrder: safeInteger(currency.sortOrder, 999),
        iconAssetId: currency.iconAssetId || null
      };
    }).filter(function (currency) {
      return Boolean(currency.currencyId);
    }).sort(function (left, right) {
      return safeInteger(left.sortOrder, 999) - safeInteger(right.sortOrder, 999)
        || String(left.displayName || left.currencyId).localeCompare(String(right.displayName || right.currencyId));
    });
    const equipmentSlots = Object.values(slots).filter(function (slot) { return slot && slot.id; }).map(function (slot) {
      return { slotId: slot.id, displayName: slot.displayName || slot.id, sortOrder: safeInteger(slot.uiOrder ?? slot.sortOrder, 999) };
    }).sort(function (left, right) { return left.sortOrder - right.sortOrder || String(left.displayName).localeCompare(String(right.displayName)); });
    return { items, currencies, equipmentSlots };
  }

  loadInventory(ctx) {
    const stacks = this.db.prepare("SELECT * FROM player_inventory_stacks WHERE player_id = ? AND quantity > 0 ORDER BY updated_at DESC").all(ctx.profile.id).map((row) => {
      const item = catalogSection(ctx.catalogs, "items")[row.item_id] || {};
      return {
        kind: "stack",
        stackId: row.stack_id,
        itemId: row.item_id,
        displayName: displayForItem(ctx.catalogs, row.item_id),
        quantity: safeInteger(row.quantity, 0),
        rarity: item.rarity || null,
        category: item.category || null,
        bindState: row.bind_state,
        equipSlot: item.equipmentSlotRef && catalogSection(ctx.catalogs, "equipmentSlots")[item.equipmentSlotRef] ? item.equipmentSlotRef : null
      };
    });
    const instances = this.db.prepare("SELECT * FROM player_item_instances WHERE player_id = ? AND location_type = 'inventory' ORDER BY updated_at DESC").all(ctx.profile.id).map((row) => {
      const item = catalogSection(ctx.catalogs, "items")[row.item_id] || {};
      return {
        kind: "instance",
        instanceId: row.id,
        itemId: row.item_id,
        displayName: displayForItem(ctx.catalogs, row.item_id),
        quantity: 1,
        rarity: row.quality || item.rarity || null,
        category: item.category || null,
        bindState: row.bind_state,
        durability: row.durability,
        maxDurability: row.max_durability,
        variantKey: inventoryVariantKey(row),
        // Terugbouw zonder nodes: de tas toont "Uitrusten" bij items met een uitrustingsplek.
        equipSlot: item.equipmentSlotRef && catalogSection(ctx.catalogs, "equipmentSlots")[item.equipmentSlotRef] ? item.equipmentSlotRef : null
      };
    });
    return { items: stacks.concat(instances), stackCount: stacks.length, instanceCount: instances.length };
  }

  loadEquipment(ctx) {
    return this.db.prepare(`
      SELECT e.slot_id, e.item_instance_id, i.item_id, i.quality, i.durability, i.max_durability
      FROM player_equipment e
      JOIN player_item_instances i ON i.id = e.item_instance_id
      WHERE e.player_id = ?
      ORDER BY e.slot_id ASC
    `).all(ctx.profile.id).map((row) => {
      const slot = catalogSection(ctx.catalogs, "equipmentSlots")[row.slot_id] || {};
      const item = catalogSection(ctx.catalogs, "items")[row.item_id] || {};
      return {
        slotId: row.slot_id,
        slotName: slot.displayName || row.slot_id,
        itemInstanceId: row.item_instance_id,
        itemId: row.item_id,
        displayName: item.displayName || row.item_id,
        rarity: row.quality || item.rarity || null,
        durability: row.durability,
        maxDurability: row.max_durability
      };
    });
  }

  loadEntities(ctx) {
    const all = [];
    const statement = this.db.prepare(`
      SELECT * FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id LIKE ?
      ORDER BY instance_id ASC
    `);
    for (const zoneCtx of this.snapshotZoneContexts(ctx)) {
      const rows = statement.all(zoneCtx.worldId, zoneCtx.zoneId, NODE03_INSTANCE_PREFIX + "%");
      for (const row of rows) {
        const entity = safeJsonParse(row.state_json, {}) || {};
        // Quest Builder stap 4: een pickup per speler is voor jou weg zodra jij hem had (anderen zien hem nog).
        if (entity.entityKind === "pickup" && (entity.claimMode === "personal" || entity.claimMode === "once") && ctx.profile?.id
          && this.pickupClaim(ctx.profile.id, entity.instanceId)) Object.assign(entity, { available: false, status: "claimed" });
        const distance = positionDistance(ctx.position, entity);
        all.push(Object.assign({}, entity, {
          zoneId: zoneCtx.zoneId,
          zoneName: zoneCtx.zonePackage?.zone?.displayName || zoneCtx.zoneId,
          revision: safeInteger(row.revision, 1),
          distance: distance === null ? null : round(distance)
        }));
      }
    }
    return {
      all,
      enemies: all.filter(function (entity) { return entity.entityKind === "enemy"; }),
      resources: all.filter(function (entity) { return entity.entityKind === "resource"; }),
      pickups: all.filter(function (entity) { return entity.entityKind === "pickup"; })
    };
  }

  linkOriginPosition(ctx, link) {
    const portal = (Array.isArray(ctx.zonePackage?.entities) ? ctx.zonePackage.entities : []).map(function (entity) {
      if (entity?.nodeType !== "entity_assembly" || entity.model?.nodeType !== "model_entity") return null;
      const component = (Array.isArray(entity.components) ? entity.components : []).find(function (candidate) {
        return candidate?.nodeType === "portal_component" && candidate.zoneLinkRef === link?.linkId;
      });
      return component ? { entity, component } : null;
    }).find(Boolean);
    if (portal) {
      return {
        x: safeNumber(portal.entity.model.x, 0),
        y: safeNumber(portal.entity.model.y, 0),
        z: safeNumber(portal.entity.model.z, 0),
        radius: Math.max(0, safeNumber(portal.entity.model.collisionRadius, 0)),
        visualEntityId: portal.entity.model.nodeId || portal.entity.model.entityId || null,
        modelAssetId: safeString(portal.entity.model.modelAssetId, ""),
        label: safeString(portal.entity.label || portal.entity.model.label, ""),
        component: portal.component
      };
    }
    const targetRef = safeString(link?.fromTargetRef || link?.fromSpawnRef, "");
    const spawns = Array.isArray(ctx.zonePackage?.spawns) ? ctx.zonePackage.spawns : [];
    const spawn = spawns.find(function (candidate) {
      return candidate && candidate.spawnId === targetRef;
    }) || spawns.find(function (candidate) {
      return candidate && candidate.role === "zone_default";
    }) || null;
    if (spawn) return { x: safeNumber(spawn.x, 0), y: safeNumber(spawn.y, 0), z: safeNumber(spawn.z, 0) };
    return { x: safeNumber(ctx.position?.x, 0), y: safeNumber(ctx.position?.y, 0), z: safeNumber(ctx.position?.z, 0) };
  }

  buildZoneLinkTargets(ctx) {
    const links = Array.isArray(ctx.zonePackage?.links) ? ctx.zonePackage.links : [];
    return links.filter(function (link) {
      return link && link.toZoneRef && (link.toSpawnRef || link.toPortalRef) && link.linkId;
    }).map((link) => {
      const position = this.linkOriginPosition(ctx, link);
      if (!position.component || !position.visualEntityId || !position.modelAssetId) return null;
      const targetZone = ctx.project?.zones?.byId?.[link.toZoneRef] || null;
      const distance = positionDistance(ctx.position, position);
      const range = Math.max(0.1, safeNumber(position.component.range, 4));
      const radius = Math.max(0, safeNumber(position.radius, 0));
      const targetName = position.label || targetZone?.zone?.displayName || link.toZoneRef;
      return {
        instanceId: link.linkId,
        entityKind: "zone_link",
        targetKind: "zone_link",
        action: "travel",
        prompt: position.component?.interactionPrompt || link.prompt || "Travel",
        displayName: targetName,
        status: "available",
        available: true,
        distance: distance === null ? null : round(distance),
        range,
        radius,
        inRange: link.interactionRequired === false || distance === null || distance <= range + radius,
        healthCurrent: null,
        healthMax: null,
        lootTableRef: null,
        x: position.x,
        y: position.y,
        z: position.z,
        visualEntityId: position.visualEntityId || null,
        renderBody: false,
        toZoneRef: link.toZoneRef,
        toSpawnRef: link.toSpawnRef,
        toPortalRef: link.toPortalRef
      };
    }).filter(Boolean);
  }

  buildInteractionTargets(ctx, entities) {
    const config = interactionHudConfig(ctx.project) || {};
    const kinds = normalizeTargetKinds(config.targetKinds);
    const maxTargets = clamp(safeInteger(config.maxTargets, 8), 1, 40);
    const runtimeTargets = (entities.all || [])
      .filter(function (entity) { return kinds.includes(entity.targetKind || entity.entityKind); })
      .map((entity) => {
        const action = entity?.interaction?.action || (entity.entityKind === "enemy" ? "attack" : entity.entityKind === "resource" ? "gather" : "pickup");
        const range = this.actionRange(ctx, action, entity);
        const distance = positionDistance(ctx.position, entity);
        const available = entity.entityKind === "enemy"
          ? entity.alive !== false && entity.status !== "dead"
          : entity.available !== false && !["depleted", "claimed"].includes(entity.status);
        return {
          instanceId: entity.instanceId,
          entityKind: entity.entityKind,
          action,
          prompt: entity?.interaction?.prompt || action,
          displayName: entity.displayName,
          status: entity.status,
          available,
          distance: distance === null ? null : round(distance),
          range,
          radius: safeNumber(entity.radius, 0),
          inRange: distance === null ? true : distance <= range + safeNumber(entity.radius, 0),
          healthCurrent: entity.healthCurrent ?? null,
          healthMax: entity.healthMax ?? null,
          visualEntityId: entity.visualEntityId || null,
          modelAssetId: entity.modelAssetId || null,
          modelScale: safeNumber(entity.modelScale, 1),
          modelScaleX: entity.modelScaleX ?? null,
          modelScaleY: entity.modelScaleY ?? null,
          modelScaleZ: entity.modelScaleZ ?? null,
          modelRotationX: entity.modelRotationX ?? null,
          modelRotationY: entity.modelRotationY ?? null,
          modelRotationZ: entity.modelRotationZ ?? null,
          renderBody: entity.renderBody !== false,
          lootTableRef: entity.lootTableRef || null,
          x: entity.x,
          y: entity.y,
          z: entity.z,
          respawnAt: entity.respawnAt || null
        };
      });
    const linkTargets = kinds.includes("zone_link") ? this.buildZoneLinkTargets(ctx) : [];
    return runtimeTargets.concat(linkTargets)
      .sort(function (left, right) {
        if (left.available !== right.available) return left.available ? -1 : 1;
        return safeNumber(left.distance, 999999) - safeNumber(right.distance, 999999);
      })
      .slice(0, maxTargets);
  }
}
