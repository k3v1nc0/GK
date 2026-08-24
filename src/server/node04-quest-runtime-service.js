import crypto from "node:crypto";
import { QUEST_STATUS, OBJECTIVE_STATUS, OBJECTIVE_TYPES } from "../shared/quest-contract.js";

const DEFAULT_LOADOUT_ID = "loadout.main";

function now() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return prefix + "_" + crypto.randomUUID();
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
  return JSON.stringify(value || {});
}

function catalogSection(catalogs, key) {
  return catalogs && typeof catalogs[key] === "object" && catalogs[key] ? catalogs[key] : {};
}

function firstObjectValue(source) {
  const values = Object.values(source || {});
  return values.length ? values[0] : null;
}

function policiesOfType(project, type) {
  return Array.isArray(project?.playerRules?.byType?.[type]) ? project.playerRules.byType[type] : [];
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

function positionDistance(position, target) {
  if (!position || !target) return null;
  return Math.hypot(safeNumber(position.x, 0) - safeNumber(target.x, 0), safeNumber(position.z, 0) - safeNumber(target.z, 0));
}

function xpForLevel(catalogs, curveRef, level) {
  const targetLevel = Math.max(1, safeInteger(level, 1));
  if (targetLevel <= 1) return 0;
  const curve = catalogSection(catalogs, "statCurves")[curveRef] || firstObjectValue(catalogSection(catalogs, "statCurves"));
  const points = (Array.isArray(curve?.points) ? curve.points : [])
    .map(function (point) { return { x: safeNumber(point?.x, 0), y: safeNumber(point?.y, 0) }; })
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
  while (level < cap && totalXp >= xpForLevel(catalogs, curveRef, level + 1)) level += 1;
  return level;
}

function campaignPackage(project) {
  return project?.campaigns && typeof project.campaigns === "object" ? project.campaigns : {};
}

function allQuests(project) {
  return Object.values(campaignPackage(project)?.quests?.byId || {});
}

function questById(project, questId) {
  const id = safeString(questId);
  return campaignPackage(project)?.quests?.byId?.[id] || null;
}

function dialogueById(project, dialogueId) {
  const id = safeString(dialogueId);
  return campaignPackage(project)?.dialogues?.byId?.[id] || null;
}

function stepById(quest, stepId) {
  const id = safeString(stepId);
  return quest?.stepsById?.[id] || (Array.isArray(quest?.steps) ? quest.steps.find(function (step) { return step.id === id; }) : null) || null;
}

function sortedQuestSteps(quest) {
  return (Array.isArray(quest?.steps) ? quest.steps : []).slice().sort(function (left, right) {
    if (safeInteger(left.sequenceIndex, 0) !== safeInteger(right.sequenceIndex, 0)) {
      return safeInteger(left.sequenceIndex, 0) - safeInteger(right.sequenceIndex, 0);
    }
    return String(left.id || "").localeCompare(String(right.id || ""));
  });
}

function nextStepFor(quest, currentStep) {
  if (!quest || !currentStep) return null;
  const explicit = stepById(quest, currentStep.nextStepRef);
  if (explicit) return explicit;
  const steps = sortedQuestSteps(quest);
  const index = steps.findIndex(function (step) { return step.id === currentStep.id; });
  return index >= 0 ? steps[index + 1] || null : null;
}

function defaultStepForAccept(quest) {
  const steps = sortedQuestSteps(quest);
  const start = stepById(quest, quest?.startStepRef) || steps[0] || null;
  if (!start || start.stepType !== OBJECTIVE_TYPES.TALK) return start;
  return nextStepFor(quest, start) || start;
}

function compareNumbers(left, comparison, right) {
  if (comparison === ">") return left > right;
  if (comparison === "==") return left === right;
  if (comparison === "!=") return left !== right;
  if (comparison === "<=") return left <= right;
  if (comparison === "<") return left < right;
  return left >= right;
}

export class Node04QuestRuntimeService {
  constructor(db, repository, mmoService, node03RuntimeService) {
    this.db = db;
    this.repository = repository;
    this.mmoService = mmoService;
    this.node03RuntimeService = node03RuntimeService;
  }

  getRequestContext(req) {
    const ctx = this.node03RuntimeService.getRequestContext(req);
    ctx.campaigns = campaignPackage(ctx.project);
    return ctx;
  }

  ensureRuntime(ctx) {
    this.node03RuntimeService.ensurePlayerRuntime(ctx);
    this.node03RuntimeService.ensureZoneEntityState(ctx);
    this.ensureAvailableQuests(ctx);
    this.syncAutoProgress(ctx);
  }

  snapshotForRequest(req) {
    const ctx = this.getRequestContext(req);
    this.ensureRuntime(ctx);
    return this.buildSnapshot(ctx);
  }

  listQuestsForRequest(req) {
    const snapshot = this.snapshotForRequest(req);
    return {
      ok: true,
      schemaVersion: snapshot.schemaVersion,
      quests: snapshot.quests,
      trackedQuest: snapshot.trackedQuest
    };
  }

  questForRequest(req, questId) {
    const snapshot = this.snapshotForRequest(req);
    const quest = snapshot.quests.all.find(function (candidate) { return candidate.questId === questId; }) || null;
    if (!quest) {
      const error = new Error("Quest niet gevonden.");
      error.status = 404;
      throw error;
    }
    return { ok: true, quest };
  }

  actionForRequest(req, payload = {}) {
    const ctx = this.getRequestContext(req);
    const action = safeString(payload.action, "").toLowerCase();
    if (action === "start_dialogue") return this.startDialogue(ctx, payload);

    const operationId = safeString(payload.operationId || payload.operation_id, "") || randomId("node04_operation");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.ensureRuntime(ctx);
      let result;
      if (action === "choose_dialogue") result = this.chooseDialogue(ctx, payload, operationId);
      else if (action === "accept_quest") result = this.acceptQuest(ctx, safeString(payload.questId || payload.quest_id), operationId, "player_accept");
      else if (action === "turn_in") result = this.turnInQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
      else if (action === "reach") result = this.completeReachQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
      else if (action === "track") result = this.trackQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
      else if (action === "abandon") result = this.abandonQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
      else if (action === "reset_node04") result = this.resetNode04(ctx);
      else {
        const error = new Error("Onbekende NODE-04 actie.");
        error.status = 400;
        throw error;
      }
      this.db.exec("COMMIT");
      return Object.assign({ ok: true, operationId }, result, { snapshot: this.snapshotForRequestFromContext(ctx) });
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  snapshotForRequestFromContext(ctx) {
    this.ensureAvailableQuests(ctx);
    this.syncAutoProgress(ctx);
    return this.buildSnapshot(ctx);
  }

  ensureAvailableQuests(ctx) {
    const existingRows = this.loadQuestStateRows(ctx);
    const existing = new Map(existingRows.map(function (row) { return [row.quest_id, row]; }));
    for (const quest of allQuests(ctx.project)) {
      if (!quest?.id || existing.has(quest.id)) continue;
      if (!this.questPrerequisitesMet(ctx, quest)) continue;
      this.insertQuestState(ctx, quest.id, QUEST_STATUS.AVAILABLE, null, quest.autoTrack === true ? 1 : 0, "available");
      existing.set(quest.id, { quest_id: quest.id, status: QUEST_STATUS.AVAILABLE });
    }
  }

  questPrerequisitesMet(ctx, quest) {
    const refs = Array.isArray(quest?.prerequisiteQuestRefs) ? quest.prerequisiteQuestRefs : [];
    if (!refs.length) return true;
    for (const questId of refs) {
      const row = this.loadQuestState(ctx.profile.id, questId);
      if (!row || row.status !== QUEST_STATUS.COMPLETED) return false;
    }
    return true;
  }

  insertQuestState(ctx, questId, status, stepId, tracked, reason) {
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, completed_at, claimed_at, revision, state_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, '{}', ?)
      ON CONFLICT(player_id, quest_id) DO NOTHING
    `).run(
      ctx.profile.id,
      questId,
      status,
      stepId || null,
      tracked ? 1 : 0,
      status === QUEST_STATUS.ACTIVE ? stamp : null,
      status === QUEST_STATUS.COMPLETED ? stamp : null,
      stamp
    );
    this.audit(ctx, questId, null, status, null, stepId || null, null, reason, {});
  }

  loadQuestStateRows(ctx) {
    return this.db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? ORDER BY updated_at ASC").all(ctx.profile.id);
  }

  loadQuestState(playerId, questId) {
    return this.db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ? LIMIT 1").get(playerId, questId);
  }

  syncAutoProgress(ctx) {
    const rows = this.loadQuestStateRows(ctx).filter(function (row) {
      return row.status === QUEST_STATUS.ACTIVE;
    });
    for (const row of rows) {
      const quest = questById(ctx.project, row.quest_id);
      const step = stepById(quest, row.active_step_id) || defaultStepForAccept(quest);
      if (!quest || !step) continue;
      const progress = this.evaluateStepProgress(ctx, quest, step);
      this.persistObjectiveProgress(ctx, quest, step, progress);
      if (step.autoAdvance !== false && progress.complete) {
        const next = nextStepFor(quest, step);
        if (next) {
          this.updateQuestState(ctx, quest.id, QUEST_STATUS.ACTIVE, next.id, row.status, row.active_step_id, "auto_advance");
        }
      }
    }
  }

  persistObjectiveProgress(ctx, quest, step, progress) {
    const stamp = now();
    for (const objective of progress.objectives) {
      this.db.prepare(`
        INSERT INTO player_objective_progress (player_id, quest_id, step_id, objective_id, current_value, required_value, status, revision, progress_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(player_id, quest_id, step_id, objective_id) DO UPDATE SET
          current_value = excluded.current_value,
          required_value = excluded.required_value,
          status = excluded.status,
          revision = player_objective_progress.revision + 1,
          progress_json = excluded.progress_json,
          updated_at = excluded.updated_at
      `).run(
        ctx.profile.id,
        quest.id,
        step.id,
        objective.objectiveId,
        safeInteger(objective.currentValue, 0),
        Math.max(1, safeInteger(objective.requiredValue, 1)),
        objective.complete ? OBJECTIVE_STATUS.COMPLETED : OBJECTIVE_STATUS.ACTIVE,
        stableJson(objective),
        stamp
      );
    }
  }

  updateQuestState(ctx, questId, status, activeStepId, fromStatus, fromStepId, reason, extra = {}) {
    const stamp = now();
    this.db.prepare(`
      UPDATE player_quest_states
      SET status = ?,
          active_step_id = ?,
          tracked = CASE WHEN ? IN ('active', 'ready_to_turn_in') THEN 1 ELSE tracked END,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END,
          claimed_at = CASE WHEN ? = 'completed' THEN COALESCE(claimed_at, ?) ELSE claimed_at END,
          revision = revision + 1,
          updated_at = ?
      WHERE player_id = ? AND quest_id = ?
    `).run(status, activeStepId || null, status, status, stamp, status, stamp, stamp, ctx.profile.id, questId);
    this.audit(ctx, questId, fromStatus, status, fromStepId, activeStepId || null, extra.operationId || null, reason, extra);
  }

  audit(ctx, questId, fromStatus, toStatus, fromStepId, toStepId, operationId, reason, payload) {
    this.db.prepare(`
      INSERT INTO quest_transition_audit (id, player_id, quest_id, from_status, to_status, from_step_id, to_step_id, operation_id, reason, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("quest_audit"), ctx.profile.id, questId, fromStatus || null, toStatus, fromStepId || null, toStepId || null, operationId || null, reason, stableJson(payload || {}), now());
  }

  acceptQuest(ctx, questId, operationId, reason = "player_accept") {
    const quest = questById(ctx.project, questId);
    if (!quest) {
      const error = new Error("Quest niet gevonden.");
      error.status = 404;
      throw error;
    }
    if (!this.questPrerequisitesMet(ctx, quest)) {
      const error = new Error("Deze quest is nog niet vrijgespeeld.");
      error.status = 400;
      throw error;
    }
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    if (row?.status === QUEST_STATUS.COMPLETED) {
      return { message: "Quest is al voltooid.", events: [] };
    }
    if (row?.status === QUEST_STATUS.ACTIVE) {
      return { message: "Quest is al actief.", events: [] };
    }
    const step = defaultStepForAccept(quest);
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, revision, state_json, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, 1, '{}', ?)
      ON CONFLICT(player_id, quest_id) DO UPDATE SET
        status = 'active',
        active_step_id = excluded.active_step_id,
        tracked = excluded.tracked,
        accepted_at = COALESCE(player_quest_states.accepted_at, excluded.accepted_at),
        revision = player_quest_states.revision + 1,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, quest.id, step?.id || null, quest.autoTrack !== false ? 1 : 0, stamp, stamp);
    this.audit(ctx, quest.id, row?.status || null, QUEST_STATUS.ACTIVE, row?.active_step_id || null, step?.id || null, operationId, reason, {});
    this.node03RuntimeService.recordGameplayEvent(ctx, "quest_accepted", "player", quest.id, { stepId: step?.id || null });
    return { message: "Quest accepted: " + (quest.displayName || quest.id), events: [{ type: "quest_accepted", questId: quest.id }] };
  }

  trackQuest(ctx, questId, operationId) {
    const quest = questById(ctx.project, questId);
    if (!quest) {
      const error = new Error("Quest niet gevonden.");
      error.status = 404;
      throw error;
    }
    this.db.prepare("UPDATE player_quest_states SET tracked = CASE WHEN quest_id = ? THEN 1 ELSE 0 END, revision = revision + 1, updated_at = ? WHERE player_id = ?")
      .run(quest.id, now(), ctx.profile.id);
    this.audit(ctx, quest.id, null, "tracked", null, null, operationId, "track", {});
    return { message: "Quest tracked: " + (quest.displayName || quest.id), events: [{ type: "quest_tracked", questId: quest.id }] };
  }

  abandonQuest(ctx, questId, operationId) {
    const quest = questById(ctx.project, questId);
    const row = this.loadQuestState(ctx.profile.id, questId);
    if (!quest || !row || row.status !== QUEST_STATUS.ACTIVE || quest.abandonable === false) {
      const error = new Error("Deze quest kan niet verlaten worden.");
      error.status = 400;
      throw error;
    }
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.ABANDONED, row.active_step_id, row.status, row.active_step_id, "abandon", { operationId });
    return { message: "Quest verlaten.", events: [{ type: "quest_abandoned", questId: quest.id }] };
  }

  turnInQuest(ctx, questId, operationId) {
    const quest = questById(ctx.project, questId);
    const row = this.loadQuestState(ctx.profile.id, questId);
    const step = stepById(quest, row?.active_step_id);
    if (!quest || !row || row.status !== QUEST_STATUS.ACTIVE || !step) {
      const error = new Error("Quest is niet actief.");
      error.status = 400;
      throw error;
    }
    const progress = this.evaluateStepProgress(ctx, quest, step);
    if (step.stepType !== OBJECTIVE_TYPES.DELIVER || !progress.complete || !progress.conditionsMet || !this.isStepTargetInRange(ctx, step, progress)) {
      const error = new Error(progress.blockedReason || "Quest kan nog niet ingeleverd worden.");
      error.status = 400;
      throw error;
    }
    const grants = [];
    const actions = this.actionsForTurnIn(quest, step, progress);
    for (const action of actions) {
      grants.push.apply(grants, this.executeAction(ctx, action, operationId, quest.id));
    }
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.COMPLETED, null, row.status, row.active_step_id, "turn_in", { operationId, grants });
    this.node03RuntimeService.recordGameplayEvent(ctx, "quest_completed", "player", quest.id, { grants });
    for (const nextQuestId of Array.isArray(quest.nextQuestRefs) ? quest.nextQuestRefs : []) {
      const nextQuest = questById(ctx.project, nextQuestId);
      if (!nextQuest) continue;
      const startAction = { actionKind: "start_quest", questRef: nextQuest.id, mode: "activate", reason: "quest_unlock" };
      grants.push.apply(grants, this.executeAction(ctx, startAction, operationId, quest.id));
    }
    return {
      message: "Quest voltooid: " + (quest.displayName || quest.id),
      events: [{ type: "quest_completed", questId: quest.id }],
      grants
    };
  }

  completeReachQuest(ctx, questId, operationId) {
    const quest = questById(ctx.project, questId);
    const row = this.loadQuestState(ctx.profile.id, questId);
    const step = stepById(quest, row?.active_step_id);
    if (!quest || !row || row.status !== QUEST_STATUS.ACTIVE || !step) {
      const error = new Error("Quest is niet actief.");
      error.status = 400;
      throw error;
    }
    const progress = this.evaluateStepProgress(ctx, quest, step);
    if (step.stepType !== OBJECTIVE_TYPES.REACH || !progress.complete || !progress.conditionsMet) {
      const error = new Error(progress.blockedReason || "Questdoel is nog niet bereikt.");
      error.status = 400;
      throw error;
    }
    const grants = [];
    for (const action of (Array.isArray(step.rewards) ? step.rewards : []).concat(Array.isArray(quest.rewards) ? quest.rewards : [])) {
      grants.push.apply(grants, this.executeAction(ctx, action, operationId, quest.id));
    }
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.COMPLETED, null, row.status, row.active_step_id, "reach_complete", { operationId, grants });
    this.node03RuntimeService.recordGameplayEvent(ctx, "quest_completed", "player", quest.id, { grants });
    return {
      message: "Quest voltooid: " + (quest.displayName || quest.id),
      events: [{ type: "quest_completed", questId: quest.id }],
      grants
    };
  }

  actionsForTurnIn(quest, step, progress) {
    const actions = [];
    const explicitRemove = [];
    for (const action of Array.isArray(step.rewards) ? step.rewards : []) {
      if (action?.actionKind === "remove_item") explicitRemove.push(action);
      actions.push(action);
    }
    if (!explicitRemove.length) {
      for (const objective of progress.objectives) {
        if (objective.objectiveType !== OBJECTIVE_TYPES.DELIVER || !objective.itemRef) continue;
        actions.unshift({
          actionKind: "remove_item",
          itemRef: objective.itemRef,
          amount: objective.requiredValue,
          reason: "quest_turn_in"
        });
      }
    }
    return actions.concat(Array.isArray(quest.rewards) ? quest.rewards : []);
  }

  executeAction(ctx, action, operationId, sourceRef) {
    if (!action) return [];
    if (action.actionKind === "sequence") {
      const grants = [];
      for (const child of Array.isArray(action.actions) ? action.actions : []) {
        grants.push.apply(grants, this.executeAction(ctx, child, operationId, sourceRef));
      }
      return grants;
    }
    if (action.actionKind === "bundle") {
      const grants = [];
      for (const child of Array.isArray(action.rewards) ? action.rewards : []) {
        grants.push.apply(grants, this.executeAction(ctx, child, operationId, sourceRef));
      }
      return grants;
    }
    if (action.actionKind === "remove_item") {
      this.consumeItem(ctx, action.itemRef, action.amount, operationId, action.reason || "quest_turn_in", sourceRef);
      return [{ kind: "item_removed", itemId: action.itemRef, displayName: displayForItem(ctx.catalogs, action.itemRef), amount: safeInteger(action.amount, 1) }];
    }
    if (action.actionKind === "currency") {
      const grant = this.node03RuntimeService.grantCurrency(ctx, action.currencyRef, action.amountMinor, action.reason || "quest_reward", sourceRef, operationId);
      return grant ? [grant] : [];
    }
    if (action.actionKind === "xp") {
      const grant = this.grantXp(ctx, action.amount, operationId, sourceRef, action.reason || "quest_reward");
      return grant ? [grant] : [];
    }
    if (action.actionKind === "ability") {
      return [this.unlockAbility(ctx, action.abilityRef, action.rank, action.loadoutId, action.preferredSlotIndex, operationId, sourceRef, action.reason || "quest_reward")].filter(Boolean);
    }
    if (action.actionKind === "start_quest") {
      const quest = questById(ctx.project, action.questRef);
      if (!quest) return [];
      if (action.mode === "unlock_available") {
        this.insertQuestState(ctx, quest.id, QUEST_STATUS.AVAILABLE, null, quest.autoTrack === true ? 1 : 0, action.reason || "quest_unlock");
        return [{ kind: "quest_unlocked", questId: quest.id, displayName: quest.displayName || quest.id }];
      }
      if (action.mode === "track_only") {
        this.trackQuest(ctx, quest.id, operationId);
        return [{ kind: "quest_tracked", questId: quest.id, displayName: quest.displayName || quest.id }];
      }
      this.acceptQuest(ctx, quest.id, operationId, action.reason || "quest_unlock");
      return [{ kind: "quest_started", questId: quest.id, displayName: quest.displayName || quest.id }];
    }
    return [];
  }

  consumeItem(ctx, itemId, amount, operationId, reason, sourceRef) {
    const quantity = Math.max(1, safeInteger(amount, 1));
    if (this.node03RuntimeService.ownedItemCount(ctx.profile.id, itemId) < quantity) {
      const error = new Error("Niet genoeg " + displayForItem(ctx.catalogs, itemId) + ".");
      error.status = 400;
      throw error;
    }
    let remaining = quantity;
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
      this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "item_stack", itemId, -take, before, after, reason, sourceRef);
      remaining -= take;
    }
    if (remaining <= 0) return;
    const instances = this.db.prepare(`
      SELECT * FROM player_item_instances
      WHERE player_id = ? AND item_id = ? AND location_type != 'deleted'
      ORDER BY created_at ASC
    `).all(ctx.profile.id, itemId);
    for (const item of instances) {
      if (remaining <= 0) break;
      this.db.prepare(`
        UPDATE player_item_instances
        SET location_type = 'deleted', location_ref = ?, revision = revision + 1, updated_at = ?
        WHERE id = ?
      `).run(reason, now(), item.id);
      this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "item_instance", itemId, -1, 1, 0, reason, sourceRef);
      remaining -= 1;
    }
  }

  grantXp(ctx, amount, operationId, sourceRef, reason) {
    const grantAmount = Math.max(0, safeInteger(amount, 0));
    if (grantAmount <= 0) return null;
    const progressionPolicy = policiesOfType(ctx.project, "player_progression_rules")[0] || {};
    const curveRef = progressionPolicy.xpCurveRef || "stat_curve.player_xp";
    const maxLevel = progressionPolicy.maxLevel || 10;
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id);
    const beforeXp = safeInteger(row?.xp, 0);
    const beforeLevel = safeInteger(row?.level, 1);
    const afterXp = beforeXp + grantAmount;
    const afterLevel = levelForXp(ctx.catalogs, curveRef, afterXp, maxLevel);
    this.db.prepare(`
      UPDATE player_progression
      SET xp = ?, level = ?, skill_points = skill_points + ?, revision = revision + 1, updated_at = ?
      WHERE player_id = ?
    `).run(afterXp, afterLevel, Math.max(0, afterLevel - beforeLevel), now(), ctx.profile.id);
    this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "xp", "xp", grantAmount, beforeXp, afterXp, reason, sourceRef);
    return { kind: "xp", amount: grantAmount, beforeXp, afterXp, beforeLevel, afterLevel };
  }

  unlockAbility(ctx, abilityId, rank, loadoutId, preferredSlotIndex, operationId, sourceRef, reason) {
    const id = safeString(abilityId);
    if (!id) return null;
    const stamp = now();
    const existing = this.db.prepare("SELECT rank FROM player_abilities WHERE player_id = ? AND ability_id = ? LIMIT 1").get(ctx.profile.id, id);
    this.db.prepare(`
      INSERT INTO player_abilities (player_id, ability_id, rank, unlock_source, unlocked_at, revision)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT(player_id, ability_id) DO UPDATE SET
        rank = MAX(player_abilities.rank, excluded.rank),
        revision = player_abilities.revision + 1
    `).run(ctx.profile.id, id, Math.max(1, safeInteger(rank, 1)), reason, stamp);
    const loadout = safeString(loadoutId, DEFAULT_LOADOUT_ID);
    const occupied = new Set(this.db.prepare("SELECT slot_index FROM player_ability_loadouts WHERE player_id = ? AND loadout_id = ? AND ability_id IS NOT NULL").all(ctx.profile.id, loadout).map(function (row) {
      return safeInteger(row.slot_index, 0);
    }));
    const alreadySlotted = this.db.prepare("SELECT slot_index FROM player_ability_loadouts WHERE player_id = ? AND loadout_id = ? AND ability_id = ? LIMIT 1")
      .get(ctx.profile.id, loadout, id);
    if (!alreadySlotted) {
      let slot = Math.max(0, safeInteger(preferredSlotIndex, 2));
      if (occupied.has(slot)) {
        slot = 0;
        while (occupied.has(slot) && slot < 12) slot += 1;
      }
      this.db.prepare(`
        INSERT INTO player_ability_loadouts (player_id, loadout_id, slot_index, ability_id, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(player_id, loadout_id, slot_index) DO UPDATE SET
          ability_id = COALESCE(player_ability_loadouts.ability_id, excluded.ability_id),
          updated_at = excluded.updated_at
      `).run(ctx.profile.id, loadout, slot, id, stamp);
    }
    if (!existing) this.node03RuntimeService.recordLedger(operationId, ctx.profile.id, "ability", id, 1, 0, 1, reason, sourceRef);
    return { kind: "ability", abilityId: id, displayName: displayForAbility(ctx.catalogs, id), rank: Math.max(1, safeInteger(rank, 1)) };
  }

  startDialogue(ctx, payload = {}) {
    this.ensureRuntime(ctx);
    const targetId = safeString(payload.targetId || payload.target_id);
    const dialogueId = safeString(payload.dialogueId || payload.dialogue_id);
    const dialogue = dialogueId ? dialogueById(ctx.project, dialogueId) : this.dialogueForTarget(ctx, targetId);
    if (!dialogue) {
      const error = new Error("Dialogue niet gevonden.");
      error.status = 404;
      throw error;
    }
    return {
      ok: true,
      message: "Dialogue gestart.",
      dialogue: this.buildDialogueRuntime(ctx, dialogue, payload.entryId || payload.entry_id),
      snapshot: this.buildSnapshot(ctx)
    };
  }

  chooseDialogue(ctx, payload = {}, operationId) {
    const dialogue = dialogueById(ctx.project, payload.dialogueId || payload.dialogue_id) || this.dialogueForTarget(ctx, payload.targetId || payload.target_id);
    if (!dialogue) {
      const error = new Error("Dialogue niet gevonden.");
      error.status = 404;
      throw error;
    }
    const entry = dialogue.entriesById?.[payload.entryId || payload.entry_id || dialogue.startEntryRef] || dialogue.entries?.[0] || null;
    const choiceId = safeString(payload.choiceId || payload.choice_id);
    const choice = (Array.isArray(entry?.choices) ? entry.choices : []).find(function (candidate) {
      return candidate.id === choiceId;
    }) || null;
    if (!choice) {
      const error = new Error("Dialogue keuze niet gevonden.");
      error.status = 404;
      throw error;
    }
    this.db.prepare(`
      INSERT INTO player_dialogue_choices (id, player_id, dialogue_id, entry_id, choice_id, quest_id, chosen_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("dialogue_choice"), ctx.profile.id, dialogue.id, entry?.id || null, choice.id, choice.questRef || null, now(), stableJson(choice));
    this.node03RuntimeService.recordGameplayEvent(ctx, "dialogue_choice", "player", dialogue.id, { entryId: entry?.id || null, choiceId: choice.id });
    const events = [{ type: "dialogue_choice", dialogueId: dialogue.id, choiceId: choice.id }];
    let message = "Dialogue keuze verwerkt.";
    if (choice.action === "accept_quest" && choice.questRef) {
      const accepted = this.acceptQuest(ctx, choice.questRef, operationId, "dialogue_accept");
      events.push.apply(events, accepted.events || []);
      message = accepted.message || message;
    } else if (choice.action === "turn_in_quest" && choice.questRef) {
      const turnedIn = this.turnInQuest(ctx, choice.questRef, operationId);
      events.push.apply(events, turnedIn.events || []);
      message = turnedIn.message || message;
    }
    const nextDialogue = choice.closeAfterSelect || choice.action === "close"
      ? null
      : this.buildDialogueRuntime(ctx, dialogue, choice.nextEntryRef || entry?.nextEntryRef || null);
    return { message, events, dialogue: nextDialogue };
  }

  dialogueForTarget(ctx, targetId) {
    const id = safeString(targetId);
    return Object.values(ctx.campaigns?.dialogues?.byId || {}).find(function (dialogue) {
      return dialogue?.targetRef === id;
    }) || null;
  }

  buildDialogueRuntime(ctx, dialogue, entryId) {
    const entry = dialogue.entriesById?.[entryId] || dialogue.entriesById?.[dialogue.startEntryRef] || dialogue.entries?.[0] || null;
    if (!entry) return null;
    return {
      dialogueId: dialogue.id,
      displayName: dialogue.displayName || dialogue.id,
      targetRef: dialogue.targetRef || null,
      entryId: entry.id,
      speakerName: entry.speakerName || dialogue.displayName || "",
      text: this.resolveTokenText(ctx, entry.text || ""),
      choices: (Array.isArray(entry.choices) ? entry.choices : []).filter((choice) => {
        return this.evaluateConditions(ctx, choice.conditions || []).met;
      }).map((choice) => ({
        choiceId: choice.id,
        label: this.resolveTokenText(ctx, choice.label || "Continue"),
        action: choice.action || "none",
        questRef: choice.questRef || null,
        nextEntryRef: choice.nextEntryRef || null,
        closeAfterSelect: choice.closeAfterSelect === true || choice.action === "accept_quest" || choice.action === "close"
      }))
    };
  }

  resolveTokenText(ctx, text) {
    return safeString(text)
      .replace(/@\{player\.level\}/g, String(this.loadProgression(ctx).level || 1))
      .replace(/@\{quest\.wood_count\}/g, String(this.node03RuntimeService.ownedItemCount(ctx.profile.id, "item.wood")));
  }

  loadProgression(ctx) {
    const row = this.db.prepare("SELECT * FROM player_progression WHERE player_id = ? LIMIT 1").get(ctx.profile.id) || {};
    return {
      level: safeInteger(row.level, 1),
      xp: safeInteger(row.xp, 0),
      skillPoints: safeInteger(row.skill_points, 0)
    };
  }

  evaluateConditions(ctx, conditions) {
    const list = Array.isArray(conditions) ? conditions : [];
    const results = list.map((condition) => this.evaluateCondition(ctx, condition));
    const met = results.every(function (result) { return result.met; });
    const failed = results.find(function (result) { return !result.met; }) || null;
    return { met, results, failedReason: failed?.message || "" };
  }

  evaluateCondition(ctx, condition) {
    if (!condition) return { met: true, message: "" };
    if (condition.conditionType === "group") {
      const results = (Array.isArray(condition.conditions) ? condition.conditions : []).map((child) => this.evaluateCondition(ctx, child));
      const met = condition.mode === "any"
        ? results.some(function (result) { return result.met; })
        : results.every(function (result) { return result.met; });
      return { met, message: met ? "" : (condition.failureText || "Condition group failed."), results };
    }
    if (condition.conditionType === "player_level") {
      const level = this.loadProgression(ctx).level;
      const met = compareNumbers(level, condition.comparison, safeInteger(condition.level, 1));
      return { met, message: met ? "" : (condition.failureText || "Level " + condition.level + " nodig."), current: level, required: safeInteger(condition.level, 1) };
    }
    if (condition.conditionType === "has_item") {
      const amount = this.node03RuntimeService.ownedItemCount(ctx.profile.id, condition.itemRef);
      const required = Math.max(1, safeInteger(condition.amount, 1));
      return { met: amount >= required, message: amount >= required ? "" : (condition.failureText || "Item nodig."), current: amount, required };
    }
    return { met: true, message: "" };
  }

  evaluateStepProgress(ctx, quest, step) {
    const objectives = (Array.isArray(step?.objectives) ? step.objectives : []).map((objective) => this.evaluateObjective(ctx, objective));
    const conditions = this.evaluateConditions(ctx, step?.conditions || []);
    const objectivesComplete = objectives.length ? objectives.every(function (objective) { return objective.complete; }) : false;
    const complete = objectivesComplete && conditions.met;
    return {
      questId: quest?.id || null,
      stepId: step?.id || null,
      complete,
      conditionsMet: conditions.met,
      blockedReason: conditions.failedReason || objectives.find(function (objective) { return !objective.complete; })?.message || "",
      objectives,
      conditions: conditions.results
    };
  }

  evaluateObjective(ctx, objective) {
    const required = Math.max(1, safeInteger(objective?.requiredAmount || objective?.requiredCount, 1));
    const type = objective?.objectiveType || "custom";
    if (type === OBJECTIVE_TYPES.COLLECT || type === OBJECTIVE_TYPES.DELIVER) {
      const current = this.node03RuntimeService.ownedItemCount(ctx.profile.id, objective.itemRef);
      return Object.assign({}, objective, {
        objectiveId: objective.id || objective.objectiveId,
        objectiveType: type,
        currentValue: Math.min(current, required),
        requiredValue: required,
        complete: current >= required,
        message: current >= required ? "" : displayForItem(ctx.catalogs, objective.itemRef) + " " + current + "/" + required
      });
    }
    if (type === OBJECTIVE_TYPES.REACH) {
      const target = this.resolveQuestTarget(ctx.project, objective.targetRef);
      const zoneOk = safeString(ctx.zoneId) === safeString(objective.zoneRef || target?.zoneRef);
      const distance = target ? positionDistance(ctx.position, target) : null;
      const radius = Math.max(0.1, safeNumber(objective.radius || target?.radius, 4));
      const complete = zoneOk && distance !== null && distance <= radius;
      return Object.assign({}, objective, {
        objectiveId: objective.id || objective.objectiveId,
        objectiveType: type,
        currentValue: complete ? 1 : 0,
        requiredValue: 1,
        complete,
        distance: distance === null ? null : round(distance),
        message: complete ? "" : "Ga naar " + (target?.label || objective.targetRef || "target")
      });
    }
    if (type === OBJECTIVE_TYPES.TALK) {
      return Object.assign({}, objective, {
        objectiveId: objective.id || objective.objectiveId,
        objectiveType: type,
        currentValue: 1,
        requiredValue: 1,
        complete: true,
        message: ""
      });
    }
    return Object.assign({}, objective, {
      objectiveId: objective?.id || objective?.objectiveId || "objective.unknown",
      objectiveType: type,
      currentValue: 0,
      requiredValue: required,
      complete: false,
      message: "Objective niet ondersteund."
    });
  }

  isStepTargetInRange(ctx, step, progress) {
    const targetRef = step.targetRef || progress.objectives.find(function (objective) { return objective.targetRef; })?.targetRef || null;
    const target = this.resolveQuestTarget(ctx.project, targetRef);
    if (!target) return true;
    if (safeString(target.zoneRef || ctx.zoneId) !== safeString(ctx.zoneId)) return false;
    const distance = positionDistance(ctx.position, target);
    return distance === null || distance <= Math.max(0.1, safeNumber(target.radius, 3));
  }

  resolveQuestTarget(project, targetRef) {
    const id = safeString(targetRef);
    if (!id) return null;
    for (const zone of Array.isArray(project?.zones?.packages) ? project.zones.packages : []) {
      const target = this.findTargetInZone(zone, id);
      if (target) return target;
    }
    return null;
  }

  findTargetInZone(zone, targetId) {
    const lists = [zone?.questTargets || []];
    for (const area of Array.isArray(zone?.areas) ? zone.areas : []) lists.push(area.questTargets || []);
    for (const list of lists) {
      const target = (Array.isArray(list) ? list : []).find(function (candidate) {
        return candidate?.targetId === targetId || candidate?.id === targetId;
      });
      if (target) {
        return Object.assign({}, target, {
          targetId: target.targetId || target.id,
          zoneRef: target.zoneRef || zone.zoneId,
          x: safeNumber(target.x, 0),
          y: safeNumber(target.y, 0),
          z: safeNumber(target.z, 0),
          radius: Math.max(0.1, safeNumber(target.radius, 3))
        });
      }
    }
    return null;
  }

  buildSnapshot(ctx) {
    const rows = this.loadQuestStateRows(ctx);
    const byQuest = new Map(rows.map(function (row) { return [row.quest_id, row]; }));
    const questSummaries = allQuests(ctx.project).map((quest) => this.buildQuestSummary(ctx, quest, byQuest.get(quest.id) || null)).filter(Boolean);
    const active = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.ACTIVE || quest.status === QUEST_STATUS.READY_TO_TURN_IN; });
    const available = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.AVAILABLE; });
    const completed = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.COMPLETED; });
    const trackedQuest = active.find(function (quest) { return quest.tracked; }) || active[0] || available[0] || null;
    const questTargets = this.buildRuntimeQuestTargets(ctx, trackedQuest, available);
    const node03 = this.node03RuntimeService.buildSnapshot(ctx);
    return {
      ok: true,
      schemaVersion: "node04-runtime-v1",
      worldId: ctx.worldId,
      zoneId: ctx.zoneId,
      playerId: ctx.profile.id,
      progression: this.loadProgression(ctx),
      quests: {
        all: questSummaries,
        active,
        available,
        completed
      },
      trackedQuest,
      questTargets,
      dialogueTargets: this.buildDialogueTargets(ctx),
      notifications: this.loadNotifications(ctx),
      node03,
      generatedAt: now()
    };
  }

  buildQuestSummary(ctx, quest, row) {
    if (!quest?.id || !row) return null;
    const isActive = row.status === QUEST_STATUS.ACTIVE || row.status === QUEST_STATUS.READY_TO_TURN_IN;
    const step = isActive ? (stepById(quest, row.active_step_id) || defaultStepForAccept(quest)) : null;
    const progress = isActive && step ? this.evaluateStepProgress(ctx, quest, step) : null;
    return {
      questId: quest.id,
      displayName: quest.displayName || quest.id,
      summary: this.resolveTokenText(ctx, quest.summary || ""),
      description: this.resolveTokenText(ctx, quest.description || ""),
      status: row.status,
      tracked: row.tracked === 1,
      activeStepId: step?.id || null,
      activeStep: step ? {
        stepId: step.id,
        displayName: step.displayName || step.id,
        instruction: this.resolveTokenText(ctx, step.instruction || ""),
        stepType: step.stepType || "custom",
        targetRef: step.targetRef || null,
        zoneRef: step.zoneRef || null,
        complete: progress?.complete === true,
        conditionsMet: progress?.conditionsMet !== false,
        blockedReason: progress?.blockedReason || "",
        canTurnIn: step.stepType === OBJECTIVE_TYPES.DELIVER && progress?.complete === true && this.isStepTargetInRange(ctx, step, progress),
        canReach: step.stepType === OBJECTIVE_TYPES.REACH && progress?.complete === true,
        objectives: progress?.objectives || [],
        conditions: progress?.conditions || []
      } : null,
      nextQuestRefs: Array.isArray(quest.nextQuestRefs) ? quest.nextQuestRefs.slice() : [],
      acceptedAt: row.accepted_at || null,
      completedAt: row.completed_at || null
    };
  }

  buildRuntimeQuestTargets(ctx, trackedQuest, availableQuests) {
    const targets = [];
    if (trackedQuest?.status === QUEST_STATUS.ACTIVE && trackedQuest.activeStep) {
      const target = this.targetForActiveStep(ctx, trackedQuest);
      if (target) targets.push(target);
    }
    if (!targets.length && availableQuests.length) {
      const quest = questById(ctx.project, availableQuests[0].questId);
      const dialogue = quest?.startDialogueRef ? dialogueById(ctx.project, quest.startDialogueRef) : null;
      const target = this.resolveQuestTarget(ctx.project, dialogue?.targetRef || quest?.turnInTargetRef);
      if (target && target.zoneRef === ctx.zoneId) {
        targets.push(this.runtimeTargetFromQuestTarget(ctx, target, {
          instanceId: "node04:" + target.targetId + ":dialogue",
          action: "node04:start_dialogue",
          questId: quest.id,
          dialogueId: dialogue?.id || null,
          displayName: target.label || quest.displayName,
          prompt: "Talk",
          status: "quest available"
        }));
      }
    }
    return targets;
  }

  targetForActiveStep(ctx, trackedQuest) {
    const step = trackedQuest.activeStep;
    if (!step) return null;
    const quest = questById(ctx.project, trackedQuest.questId);
    const compiledStep = stepById(quest, step.stepId);
    const objectiveTargetRef = step.objectives.find(function (objective) { return objective.targetRef; })?.targetRef || null;
    let targetRef = compiledStep?.markerRule?.targetRef || step.targetRef || objectiveTargetRef;
    let target = this.resolveQuestTarget(ctx.project, targetRef);
    if (target && target.zoneRef !== ctx.zoneId) {
      const linkTarget = this.travelTargetTowardZone(ctx, target.zoneRef);
      if (linkTarget) return linkTarget;
    }
    if (!target && step.zoneRef && step.zoneRef !== ctx.zoneId) {
      const linkTarget = this.travelTargetTowardZone(ctx, step.zoneRef);
      if (linkTarget) return linkTarget;
    }
    if (!target || target.zoneRef !== ctx.zoneId) return null;
    let action = "node04:move_marker";
    let prompt = "Move";
    if (step.stepType === OBJECTIVE_TYPES.DELIVER) {
      action = "node04:turn_in";
      prompt = step.canTurnIn ? "Turn in" : "Move";
    } else if (step.stepType === OBJECTIVE_TYPES.REACH) {
      action = "node04:reach";
      prompt = step.canReach ? "Complete" : "Move";
    }
    return this.runtimeTargetFromQuestTarget(ctx, target, {
      instanceId: "node04:" + trackedQuest.questId + ":" + step.stepId,
      action,
      questId: trackedQuest.questId,
      displayName: target.label || step.displayName || trackedQuest.displayName,
      prompt,
      status: step.displayName || "quest target"
    });
  }

  travelTargetTowardZone(ctx, targetZoneId) {
    const links = Array.isArray(ctx.zonePackage?.links) ? ctx.zonePackage.links : [];
    const directLink = links.find(function (candidate) { return candidate.toZoneRef === targetZoneId; }) || null;
    const outwardLink = links.find(function (candidate) {
      return candidate.toZoneRef && candidate.toZoneRef !== ctx.zoneId;
    }) || null;
    const link = directLink || outwardLink || links[0] || null;
    if (!link) return null;
    const position = this.linkOriginPosition(ctx, link);
    const targetZone = ctx.project?.zones?.byId?.[link.toZoneRef] || null;
    const distance = positionDistance(ctx.position, position);
    return {
      instanceId: link.linkId,
      entityKind: "quest",
      targetKind: "quest",
      action: "travel",
      questId: null,
      displayName: "Travel: " + (targetZone?.zone?.displayName || link.toZoneRef),
      prompt: link.prompt || "Travel",
      status: "quest route",
      available: true,
      distance: distance === null ? null : round(distance),
      range: Math.max(3, safeNumber(link.preloadDistance, 30)),
      radius: 2.5,
      inRange: link.interactionRequired === false || distance === null || distance <= Math.max(3, safeNumber(link.preloadDistance, 30)),
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  linkOriginPosition(ctx, link) {
    const targetRef = safeString(link?.fromTargetRef || link?.fromSpawnRef, "");
    const spawns = Array.isArray(ctx.zonePackage?.spawns) ? ctx.zonePackage.spawns : [];
    const spawn = spawns.find(function (candidate) { return candidate && candidate.spawnId === targetRef; })
      || spawns.find(function (candidate) { return candidate && candidate.role === "zone_default"; })
      || null;
    if (spawn) return { x: safeNumber(spawn.x, 0), y: safeNumber(spawn.y, 0), z: safeNumber(spawn.z, 0) };
    return { x: safeNumber(ctx.position?.x, 0), y: safeNumber(ctx.position?.y, 0), z: safeNumber(ctx.position?.z, 0) };
  }

  runtimeTargetFromQuestTarget(ctx, target, extra) {
    const distance = positionDistance(ctx.position, target);
    const range = Math.max(1, safeNumber(target.radius, 3));
    return Object.assign({
      instanceId: "node04:" + target.targetId,
      entityKind: "quest",
      targetKind: "quest",
      action: "node04:move_marker",
      displayName: target.label || target.targetId,
      prompt: target.prompt || "Quest",
      status: "quest target",
      available: true,
      distance: distance === null ? null : round(distance),
      range,
      radius: range,
      inRange: distance === null || distance <= range,
      x: safeNumber(target.x, 0),
      y: safeNumber(target.y, 0),
      z: safeNumber(target.z, 0),
      targetId: target.targetId,
      zoneRef: target.zoneRef || ctx.zoneId
    }, extra || {});
  }

  buildDialogueTargets(ctx) {
    return Object.values(ctx.campaigns?.dialogues?.byId || {}).map((dialogue) => {
      const target = this.resolveQuestTarget(ctx.project, dialogue.targetRef);
      if (!target || target.zoneRef !== ctx.zoneId) return null;
      return this.runtimeTargetFromQuestTarget(ctx, target, {
        instanceId: "node04:" + target.targetId + ":dialogue",
        action: "node04:start_dialogue",
        dialogueId: dialogue.id,
        displayName: target.label || dialogue.displayName || dialogue.id,
        prompt: "Talk",
        status: "dialogue"
      });
    }).filter(Boolean);
  }

  loadNotifications(ctx) {
    return this.db.prepare(`
      SELECT quest_id, from_status, to_status, reason, created_at
      FROM quest_transition_audit
      WHERE player_id = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(ctx.profile.id).map((row) => ({
      questId: row.quest_id,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      reason: row.reason,
      createdAt: row.created_at,
      text: this.notificationText(ctx, row)
    }));
  }

  notificationText(ctx, row) {
    const quest = questById(ctx.project, row.quest_id);
    const name = quest?.displayName || row.quest_id;
    if (row.reason === "turn_in" || row.to_status === QUEST_STATUS.COMPLETED) return "Quest voltooid: " + name;
    if (row.to_status === QUEST_STATUS.ACTIVE) return "Quest actief: " + name;
    if (row.to_status === QUEST_STATUS.AVAILABLE) return "Quest beschikbaar: " + name;
    return name;
  }

  resetNode04(ctx) {
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_quest_states WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_dialogue_choices WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM quest_transition_audit WHERE player_id = ?").run(ctx.profile.id);
    this.ensureAvailableQuests(ctx);
    return { message: "NODE-04 quest state reset.", events: [{ type: "node04_reset" }] };
  }
}
