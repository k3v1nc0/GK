import crypto from "node:crypto";

const NODE03_INSTANCE_PREFIX = "node03:";
const HEALTH_STAT_ID = "stat.health";
const MANA_STAT_ID = "stat.mana";
const ARMOR_STAT_ID = "stat.armor";
const ATTACK_POWER_STAT_ID = "stat.attack_power";
const DEFAULT_CHARACTER_ID = "player.desert_guardian";
const DEFAULT_BIND_STATE = "unbound";

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

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
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

function stableJson(value) {
  return JSON.stringify(value);
}

function requestHash(value) {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
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

function applyStatMultipliers(baseStats, variant) {
  const multipliers = variant && typeof variant.statMultipliers === "object" ? variant.statMultipliers : {};
  const result = Object.assign({}, baseStats);
  for (const [statId, multiplier] of Object.entries(multipliers)) {
    if (!Object.prototype.hasOwnProperty.call(result, statId)) continue;
    result[statId] = result[statId] * safeNumber(multiplier, 1);
  }
  return result;
}

function xpForLevel(catalogs, curveRef, level) {
  const targetLevel = Math.max(1, safeInteger(level, 1));
  if (targetLevel <= 1) return 0;
  const curve = catalogSection(catalogs, "statCurves")[curveRef] || firstObjectValue(catalogSection(catalogs, "statCurves"));
  const points = (Array.isArray(curve?.points) ? curve.points : [])
    .map(function (point) {
      return { x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) };
    })
    .filter(function (point) { return Number.isFinite(point.x) && Number.isFinite(point.y); })
    .sort(function (left, right) { return left.x - right.x; });
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

export class Node03RuntimeService {
  constructor(db, repository, mmoService) {
    this.db = db;
    this.repository = repository;
    this.mmoService = mmoService;
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
      const error = new Error("NODE-03 runtime zone niet gevonden. Publiceer de Desert demo opnieuw.");
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

  snapshotForRequest(req) {
    const ctx = this.getRequestContext(req);
    this.ensurePlayerRuntime(ctx);
    this.ensureZoneEntityState(ctx);
    return this.buildSnapshot(ctx);
  }

  actionForRequest(req, payload = {}) {
    const ctx = this.getRequestContext(req);
    const action = safeString(payload.action, "").toLowerCase();
    const operationId = operationIdFromPayload(payload) || randomId("node03_operation");
    const hash = requestHash({ action, targetId: payload.targetId || null });
    const existing = this.db.prepare("SELECT * FROM operation_idempotency WHERE operation_id = ? LIMIT 1").get(operationId);
    if (existing) {
      if (existing.status === "completed") {
        return Object.assign({ idempotent: true }, safeJsonParse(existing.result_json, { ok: true, operationId }));
      }
      const error = new Error("Deze NODE-03 actie is al in verwerking.");
      error.status = 409;
      throw error;
    }

    this.db.exec("BEGIN IMMEDIATE");
    try {
      const stamp = now();
      this.db.prepare(`
        INSERT INTO operation_idempotency (operation_id, player_id, operation_type, request_hash, status, created_at)
        VALUES (?, ?, ?, ?, 'started', ?)
      `).run(operationId, ctx.profile.id, action || "unknown", hash, stamp);
      this.ensurePlayerRuntime(ctx);
      this.ensureZoneEntityState(ctx);
      const result = this.performAction(ctx, action, payload, operationId);
      const response = Object.assign({ ok: true, operationId }, result, { snapshot: this.buildSnapshot(ctx) });
      this.db.prepare(`
        UPDATE operation_idempotency
        SET status = 'completed', result_json = ?, completed_at = ?
        WHERE operation_id = ?
      `).run(stableJson(response), now(), operationId);
      this.db.exec("COMMIT");
      return response;
    } catch (error) {
      try {
        this.db.prepare(`
          UPDATE operation_idempotency
          SET status = 'failed', result_json = ?, completed_at = ?
          WHERE operation_id = ?
        `).run(stableJson({ ok: false, message: error.message }), now(), operationId);
      } catch {}
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  ensurePlayerRuntime(ctx) {
    const character = this.resolvePlayerCharacter(ctx);
    this.ensureProgression(ctx, character);
    this.ensureStats(ctx, character);
    this.ensureStartingAbilities(ctx, character);
    this.ensureStartingInventoryAndCurrencies(ctx, character);
    this.ensureAbilityLoadout(ctx, character);
    this.ensureStarterEquipment(ctx);
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
    const existing = this.db.prepare("SELECT player_id FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id);
    if (existing) return;
    this.db.prepare("INSERT INTO player_progression (player_id, level, xp, skill_points, revision, updated_at) VALUES (?, 1, 0, 0, 1, ?)")
      .run(ctx.profile.id, now());
  }

  ensureStats(ctx, character) {
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const statBlockRef = character?.statBlockRef || progressionPolicy.baseStatBlockRef || "stat_block.player.desert";
    const baseStats = statBlockValues(ctx.catalogs, statBlockRef);
    const stamp = now();
    for (const [statId, baseValue] of Object.entries(baseStats)) {
      const existing = this.db.prepare("SELECT * FROM player_stats WHERE player_id = ? AND stat_id = ? LIMIT 1").get(ctx.profile.id, statId);
      if (!existing) {
        this.db.prepare(`
          INSERT INTO player_stats (player_id, stat_id, base_value, earned_value, current_value, revision, updated_at)
          VALUES (?, ?, ?, 0, ?, 1, ?)
        `).run(ctx.profile.id, statId, baseValue, baseValue, stamp);
        continue;
      }
      const earned = safeNumber(existing.earned_value, 0);
      const max = baseValue + earned;
      const current = existing.current_value === null || existing.current_value === undefined
        ? null
        : clamp(safeNumber(existing.current_value, max), 0, max);
      if (safeNumber(existing.base_value, 0) !== baseValue || current !== existing.current_value) {
        this.db.prepare(`
          UPDATE player_stats
          SET base_value = ?, current_value = ?, revision = revision + 1, updated_at = ?
          WHERE player_id = ? AND stat_id = ?
        `).run(baseValue, current, stamp, ctx.profile.id, statId);
      }
    }
  }

  ensureStartingAbilities(ctx, character) {
    const refs = Array.from(new Set(Array.isArray(character?.startingAbilityRefs) ? character.startingAbilityRefs : []));
    const stamp = now();
    for (const abilityId of refs) {
      this.db.prepare(`
        INSERT INTO player_abilities (player_id, ability_id, rank, unlock_source, unlocked_at, revision)
        VALUES (?, ?, 1, 'starting_character', ?, 1)
        ON CONFLICT(player_id, ability_id) DO NOTHING
      `).run(ctx.profile.id, abilityId, stamp);
    }
  }

  ensureStartingInventoryAndCurrencies(ctx, character) {
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
      if (!itemId || this.ownedItemCount(ctx.profile.id, itemId) > 0) continue;
      this.grantItem(ctx, itemId, amount, "starting_character", "character");
    }
  }

  ensureAbilityLoadout(ctx, character) {
    const refs = Array.from(new Set(Array.isArray(character?.startingAbilityRefs) ? character.startingAbilityRefs : []));
    const loadoutId = safeString(character?.defaultLoadoutId, "loadout.main");
    const stamp = now();
    refs.slice(0, 12).forEach((abilityId, index) => {
      this.db.prepare(`
        INSERT INTO player_ability_loadouts (player_id, loadout_id, slot_index, ability_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(player_id, loadout_id, slot_index) DO NOTHING
      `).run(ctx.profile.id, loadoutId, index, abilityId, stamp);
    });
  }

  ensureStarterEquipment(ctx) {
    const slots = catalogSection(ctx.catalogs, "equipmentSlots");
    const items = catalogSection(ctx.catalogs, "items");
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
    return result;
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
    const result = [];
    for (let index = 0; index < count; index += 1) {
      const offset = spawnOffset(index, count, safeNumber(spawn.radius, 0));
      const instanceId = NODE03_INSTANCE_PREFIX + ctx.zoneId + ":" + safeString(spawn.spawnEntryId || spawn.nodeId, "enemy_spawn") + ":enemy:" + (index + 1);
      result.push({
        version: 1,
        instanceId,
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
        entityKind: "resource",
        targetKind: "resource",
        nodeType: spawn.nodeType,
        spawnEntryId: spawn.spawnEntryId || spawn.nodeId,
        spawnSetId: spawnSet.spawnSetId || spawnSet.nodeId || null,
        spawnControllerId: controller.spawnControllerId || controller.nodeId || null,
        resourceRef: spawn.resourceRef || resource.id || null,
        displayName: safeString(resource.displayName, "Resource"),
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
    return {
      version: 1,
      instanceId,
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
      interaction: { action: "pickup", prompt: "Pick up", range: 3 },
      updatedAt: now()
    };
  }

  mergeEntityRuntimeState(ctx, current, desired) {
    if (current.entityKind !== desired.entityKind) return desired;
    const merged = Object.assign({}, current, desired, {
      updatedAt: current.updatedAt || desired.updatedAt
    });
    if (desired.entityKind === "enemy") {
      const wasAlive = current.alive !== false && current.status !== "dead";
      merged.alive = wasAlive;
      merged.status = wasAlive ? "alive" : "dead";
      merged.healthMax = desired.healthMax;
      merged.healthCurrent = wasAlive ? clamp(safeNumber(current.healthCurrent, desired.healthMax), 0, desired.healthMax) : 0;
      if (!wasAlive && current.respawnAt && Date.parse(current.respawnAt) <= Date.now()) {
        merged.alive = true;
        merged.status = "alive";
        merged.healthCurrent = desired.healthMax;
        merged.respawnAt = null;
        merged.defeatedBy = null;
      }
    } else {
      const available = current.available !== false && !["depleted", "claimed"].includes(current.status);
      merged.available = available;
      merged.status = available ? "available" : current.status;
      if (!available && current.respawnAt && Date.parse(current.respawnAt) <= Date.now()) {
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
    if (action === "reset_demo" || action === "reset") return this.resetDemo(ctx, operationId);
    if (action === "debug_inventory_add" || action === "inventory_add") return this.debugAdjustInventory(ctx, payload, operationId, 1);
    if (action === "debug_inventory_remove" || action === "inventory_remove") return this.debugAdjustInventory(ctx, payload, operationId, -1);
    if (action === "debug_currency_add" || action === "currency_add") return this.debugAdjustCurrency(ctx, payload, operationId, 1);
    if (action === "debug_currency_remove" || action === "currency_remove") return this.debugAdjustCurrency(ctx, payload, operationId, -1);
    if (this.isPlayerDead(ctx)) {
      const error = new Error("Je speler is verslagen. Gebruik Reset demo om opnieuw te testen.");
      error.status = 409;
      throw error;
    }
    if (action === "attack") return this.attackTarget(ctx, payload.targetId, operationId);
    if (action === "gather") return this.gatherTarget(ctx, payload.targetId, operationId);
    if (action === "pickup") return this.pickupTarget(ctx, payload.targetId, operationId);
    const error = new Error("Onbekende NODE-03 actie: " + (action || "-"));
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
    const row = this.db.prepare(`
      SELECT * FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id = ?
      LIMIT 1
    `).get(ctx.worldId, ctx.zoneId, instanceId);
    if (!row) return null;
    return { row, state: safeJsonParse(row.state_json, {}) || {} };
  }

  saveEntityState(ctx, entity) {
    this.db.prepare(`
      UPDATE world_entity_state
      SET state_json = ?, revision = revision + 1, updated_at = ?
      WHERE world_id = ? AND zone_id = ? AND instance_id = ?
    `).run(stableJson(entity), now(), ctx.worldId, ctx.zoneId, entity.instanceId);
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
      const ability = catalogSection(ctx.catalogs, "abilities")[entity.requiredAbilityRef || "ability.gather_sun_crystal"] || {};
      return safeNumber(ability.range, 3);
    }
    return safeNumber(entity?.interaction?.range, 3);
  }

  attackTarget(ctx, targetId, operationId) {
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
      enemy.respawnAt = addMs(respawnDelayMs(ctx.catalogs, enemy.respawnPolicyRef));
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
    if (after <= 0) this.recordGameplayEvent(ctx, "player_defeated", enemy.instanceId, "player", { damage });
    return { type: "retaliation", amount: damage, sourceId: enemy.instanceId, remainingHealth: after };
  }

  gatherTarget(ctx, targetId, operationId) {
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
    const grants = this.grantLootTable(ctx, resource.lootTableRef, operationId, resource.instanceId, "resource_gathered");
    resource.available = false;
    resource.status = "depleted";
    resource.depletedBy = ctx.profile.id;
    resource.respawnAt = addMs(respawnDelayMs(ctx.catalogs, resource.respawnPolicyRef));
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
    if (pickup.available === false || pickup.status === "claimed") {
      return { action: "pickup", targetId: pickup.instanceId, message: pickup.displayName + " is al opgepakt.", events: [] };
    }
    this.assertInRange(ctx, pickup, "pickup");
    const amount = pickup.pickupKind === "currency"
      ? Math.max(1, Math.round((safeInteger(pickup.minAmount, pickup.amount) + safeInteger(pickup.maxAmount, pickup.amount)) / 2))
      : Math.max(1, safeInteger(pickup.amount, 1));
    const grants = pickup.pickupKind === "currency"
      ? [this.grantCurrency(ctx, pickup.currencyRef, amount, "pickup_claimed", pickup.instanceId, operationId)]
      : this.grantItem(ctx, pickup.itemRef, amount, "pickup_claimed", pickup.instanceId, operationId);
    pickup.available = false;
    pickup.status = "claimed";
    pickup.claimedBy = ctx.profile.id;
    pickup.respawnAt = addMs(respawnDelayMs(ctx.catalogs, pickup.respawnPolicyRef));
    pickup.updatedAt = now();
    this.saveEntityState(ctx, pickup);
    this.recordGameplayEvent(ctx, "pickup_claimed", "player", pickup.instanceId, { grants });
    return {
      action: "pickup",
      targetId: pickup.instanceId,
      message: pickup.displayName + " picked up.",
      events: [{ type: "picked_up", targetId: pickup.instanceId, label: pickup.displayName }],
      grants
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
    ctx.position = normalized;
    this.ensureZoneEntityState(ctx);
    this.recordGameplayEvent(ctx, "node03_demo_reset", "player", null, { zoneId: ctx.zoneId });
    return {
      action: "reset_demo",
      message: "NODE-03 demo reset.",
      position: this.mmoService.publicPositionForPlayer(normalized, ctx.sessionContext.session, ctx.worldId),
      events: [{ type: "reset", zoneId: ctx.zoneId }],
      grants: []
    };
  }

  grantLootTable(ctx, lootTableRef, operationId, sourceRef, reason) {
    const table = catalogSection(ctx.catalogs, "lootTables")[lootTableRef] || null;
    const grants = [];
    for (const entry of Array.isArray(table?.entries) ? table.entries : []) {
      const chance = safeNumber(entry?.chance, 1);
      if (entry?.guaranteed !== true && chance < 0.5) continue;
      if (entry.itemRef) {
        const min = Math.max(1, safeInteger(entry.minQuantity, 1));
        const max = Math.max(min, safeInteger(entry.maxQuantity, min));
        grants.push.apply(grants, this.grantItem(ctx, entry.itemRef, Math.round((min + max) / 2), reason, sourceRef, operationId));
      } else if (entry.currencyRef) {
        const min = Math.max(1, safeInteger(entry.minAmountMinor, 1));
        const max = Math.max(min, safeInteger(entry.maxAmountMinor, min));
        grants.push(this.grantCurrency(ctx, entry.currencyRef, Math.round((min + max) / 2), reason, sourceRef, operationId));
      }
    }
    return grants.filter(Boolean);
  }

  grantItem(ctx, itemId, amount, reason, sourceRef, operationId = randomId("node03_grant")) {
    const item = catalogSection(ctx.catalogs, "items")[itemId] || {};
    const quantity = Math.max(1, safeInteger(amount, 1));
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
    if (amount <= 0) return null;
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = policy.curveRef || progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const maxLevel = progressionPolicy.maxLevel || 10;
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id);
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
    this.recordLedger(operationId, ctx.profile.id, "xp", "xp", amount, beforeXp, afterXp, "enemy_defeated", enemy.instanceId);
    return { kind: "xp", amount, beforeXp, afterXp, beforeLevel, afterLevel };
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
    const abilities = this.loadAbilities(ctx);
    const equipment = this.loadEquipment(ctx);
    const entities = this.loadEntities(ctx);
    const modules = uiModules(ctx.project);
    return {
      ok: true,
      schemaVersion: "node03-runtime-v1",
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
      abilities,
      catalog: this.loadHudCatalog(ctx),
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

  loadProgression(ctx) {
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id) || {};
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const level = safeInteger(row.level, 1);
    const xp = safeInteger(row.xp, 0);
    const currentLevelXp = xpForLevel(ctx.catalogs, curveRef, level);
    const nextLevelXp = xpForLevel(ctx.catalogs, curveRef, level + 1);
    const span = Math.max(1, nextLevelXp - currentLevelXp);
    return {
      level,
      xp,
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
    const items = Object.values(catalogSection(ctx.catalogs, "items")).map(function (item) {
      return {
        itemId: item.id,
        displayName: item.displayName || item.id,
        category: item.category || null,
        rarity: item.rarity || null,
        stackable: item.stackable !== false,
        marketEligible: item.marketEligible === true,
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 12) : []
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
        sortOrder: safeInteger(currency.sortOrder, 999)
      };
    }).filter(function (currency) {
      return Boolean(currency.currencyId);
    }).sort(function (left, right) {
      return safeInteger(left.sortOrder, 999) - safeInteger(right.sortOrder, 999)
        || String(left.displayName || left.currencyId).localeCompare(String(right.displayName || right.currencyId));
    });
    return { items, currencies };
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
        bindState: row.bind_state
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
        maxDurability: row.max_durability
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

  loadAbilities(ctx) {
    const unlocked = this.db.prepare("SELECT * FROM player_abilities WHERE player_id = ? ORDER BY ability_id ASC").all(ctx.profile.id).map((row) => ({
      abilityId: row.ability_id,
      displayName: displayForAbility(ctx.catalogs, row.ability_id),
      rank: safeInteger(row.rank, 1),
      unlockSource: row.unlock_source
    }));
    const loadout = this.db.prepare("SELECT * FROM player_ability_loadouts WHERE player_id = ? ORDER BY loadout_id ASC, slot_index ASC").all(ctx.profile.id).map((row) => ({
      loadoutId: row.loadout_id,
      slotIndex: safeInteger(row.slot_index, 0),
      abilityId: row.ability_id,
      displayName: row.ability_id ? displayForAbility(ctx.catalogs, row.ability_id) : null
    }));
    return { unlocked, loadout };
  }

  loadEntities(ctx) {
    const rows = this.db.prepare(`
      SELECT * FROM world_entity_state
      WHERE world_id = ? AND zone_id = ? AND instance_id LIKE ?
      ORDER BY instance_id ASC
    `).all(ctx.worldId, ctx.zoneId, NODE03_INSTANCE_PREFIX + "%");
    const all = rows.map((row) => {
      const entity = safeJsonParse(row.state_json, {}) || {};
      const distance = positionDistance(ctx.position, entity);
      return Object.assign({}, entity, {
        revision: safeInteger(row.revision, 1),
        distance: distance === null ? null : round(distance)
      });
    });
    return {
      all,
      enemies: all.filter(function (entity) { return entity.entityKind === "enemy"; }),
      resources: all.filter(function (entity) { return entity.entityKind === "resource"; }),
      pickups: all.filter(function (entity) { return entity.entityKind === "pickup"; })
    };
  }

  linkOriginPosition(ctx, link) {
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
      return link && link.toZoneRef && link.toSpawnRef && link.linkId && link.toZoneRef !== ctx.zonePackage?.zoneId;
    }).map((link) => {
      const position = this.linkOriginPosition(ctx, link);
      const targetZone = ctx.project?.zones?.byId?.[link.toZoneRef] || null;
      const distance = positionDistance(ctx.position, position);
      const range = Math.max(3, safeNumber(link.preloadDistance, 30));
      const targetName = targetZone?.zone?.displayName || link.toZoneRef;
      return {
        instanceId: link.linkId,
        entityKind: "zone_link",
        targetKind: "zone_link",
        action: "travel",
        prompt: link.prompt || "Travel",
        displayName: targetName,
        status: "available",
        available: true,
        distance: distance === null ? null : round(distance),
        range,
        inRange: link.interactionRequired === false || distance === null || distance <= range,
        healthCurrent: null,
        healthMax: null,
        lootTableRef: null,
        x: position.x,
        y: position.y,
        z: position.z,
        toZoneRef: link.toZoneRef,
        toSpawnRef: link.toSpawnRef
      };
    });
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
