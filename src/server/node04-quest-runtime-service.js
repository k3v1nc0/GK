import crypto from "node:crypto";
import { QUEST_STATUS, OBJECTIVE_STATUS, OBJECTIVE_TYPES } from "../shared/quest-contract.js";
import { assertDeveloperActionAllowed, normalizedActionPayloadHash } from "./action-security.js";
import { runOperation } from "./persistence/operation-contract.js";
import { QUEST_NEARBY_M, pointInArea } from "../../apps/web/public/shared/quest-graph.js";

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

function questTargetWorldName(target, fallback = "Quest Target") {
  return safeString(target?.linkedEntity?.label || target?.label, safeString(fallback, "Quest Target"));
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

// Stap 3: een Questgebied uit de build ({ points, center, radius, displayName }).
function questAreaById(project, areaId) {
  return campaignPackage(project)?.questAreas?.byId?.[safeString(areaId)] || null;
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

function questRepeatMode(quest) {
  const mode = safeString(quest?.repeatMode || "once_per_character");
  return ["repeatable", "daily", "weekly", "cooldown"].includes(mode) ? mode : "once_per_character";
}

// Stap 6: het eerstvolgende resetmoment na fromMs (servertijd): elke dag, of elke maandag, om repeatHour uur.
function nextResetMs(fromMs, mode, hour) {
  const at = new Date(fromMs);
  at.setHours(clamp(safeInteger(hour, 6), 0, 23), 0, 0, 0);
  if (mode === "weekly") at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
  while (at.getTime() <= fromMs) at.setDate(at.getDate() + (mode === "weekly" ? 7 : 1));
  return at.getTime();
}

// Wanneer mag deze speler de quest weer doen (ms)? null = nooit, 0 = nu al.
function questRepeatAtMs(row, quest) {
  const mode = questRepeatMode(quest);
  if (mode === "repeatable") return 0;
  if (mode === "once_per_character") return null;
  const completedAtMs = Date.parse(row?.completed_at || row?.completedAt || "");
  if (!Number.isFinite(completedAtMs)) return 0;
  if (mode === "cooldown") return completedAtMs + Math.max(1, safeInteger(quest.repeatMinutes, 60)) * 60000;
  return nextResetMs(completedAtMs, mode, quest.repeatHour === undefined ? 6 : quest.repeatHour);
}

function questCanRepeatNow(row, quest, nowMs = Date.now()) {
  const at = questRepeatAtMs(row, quest);
  return at !== null && nowMs >= at;
}

function questRepeatBlockedMessage(quest, row = null) {
  const at = row ? questRepeatAtMs(row, quest) : null;
  if (at) {
    const when = new Date(at);
    const time = String(when.getHours()).padStart(2, "0") + ":" + String(when.getMinutes()).padStart(2, "0");
    return "Je kunt deze quest weer doen vanaf " + (when.toDateString() === new Date().toDateString() ? "" : when.toLocaleDateString("nl-NL", { weekday: "long" }) + " ") + time + ".";
  }
  return "Quest is al voltooid.";
}

function compareNumbers(left, comparison, right) {
  if (comparison === ">") return left > right;
  if (comparison === "==") return left === right;
  if (comparison === "!=") return left !== right;
  if (comparison === "<=") return left <= right;
  if (comparison === "<") return left < right;
  return left >= right;
}

// ---- Quest Builder stap 1 (4-11): een quest is een netwerk van stappen met eindes ----------------------------
// Doelen met een gebeurtenis (versla, verzamel, pak op) telt de server zelf, 1x per gebeurtenis per speler.
const EVENT_OBJECTIVES = new Set(["defeat", "gather", "pickup"]);
const SHARE_OFFER_MS = 2 * 60 * 1000;
// Praat- en inleverkeuzes zet de quest-motor zelf in het NPC-gesprek: "quest.obj|<quest>|<stap>|<doel>".
const QUEST_CHOICE_PREFIX = "quest.obj|";
// Stap 7: een vraag van een NPC ("quest.ask|<quest>|<stap>|<doel>"), een antwoord ("quest.pick|...|<antwoord>") en "Later".
const QUEST_ASK_PREFIX = "quest.ask|";
const QUEST_PICK_PREFIX = "quest.pick|";
const QUEST_LATER_CHOICE = "quest.later";
// Stap 6: de klokken van de quests worden elke seconde bekeken (ook als de speler niets doet of offline is).
const TIMER_TICK_MS = 1000;
const MAX_STEP_HOPS = 16;
const normalizedQuests = new WeakMap();

function isOpenStatus(status) {
  return status === QUEST_STATUS.ACTIVE || status === QUEST_STATUS.READY_TO_TURN_IN;
}

function stateOf(row) {
  const state = safeJsonParse(row?.state_json || "{}", {});
  return state && typeof state === "object" ? state : {};
}

function objectiveIdOf(objective) {
  return objective?.id || objective?.objectiveId || null;
}

function objectiveIsNeeded(objective) {
  return objective?.role !== "optional" && objective?.role !== "bonus";
}

// Team samen (stap 2): alleen bij gebeurtenis-doelen (versla, verzamel, pak op).
function objectiveIsTeam(objective) {
  return objective?.share === "team" && EVENT_OBJECTIVES.has(objective?.objectiveType);
}

// Stap 2: telt deze gebeurtenis voor dit doel? fighter = deed zelf mee (altijd). group = groepsgenoot in de buurt:
// Ieder voor zich met "groep in de buurt" (standaard) of "iedereen", en Team samen. nearby = alleen bij "iedereen".
function objectiveCredits(objective, via) {
  if (via === "fighter") return true;
  if (objective?.objectiveType !== "defeat") return false;
  const credit = objective?.credit === "fighters" || objective?.credit === "nearby" ? objective.credit : "group";
  if (via === "group") return objectiveIsTeam(objective) || credit !== "fighters";
  if (via === "nearby") return !objectiveIsTeam(objective) && credit === "nearby";
  return false;
}

// Stap 3: "Alleen in gebied": de gebeurtenis (vijand, grondstof, pickup) moet in het Questgebied liggen.
function eventInArea(project, objective, event) {
  if (!objective?.inAreaRef) return true;
  const area = questAreaById(project, objective.inAreaRef);
  return Boolean(area) && pointInArea(area.points, Number(event?.at?.x), Number(event?.at?.z));
}

function objectiveEventRef(objective) {
  return objective?.actorRef || objective?.resourceRef || objective?.itemRef || null;
}

function requiredOf(objective) {
  return Math.max(1, safeInteger(objective?.requiredAmount || objective?.requiredCount, 1));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Oudere builds (1 stap deliver/reach, of een rij met nextStepRef) worden hier hetzelfde netwerk met een einde.
// De stap-ID's blijven gelijk, dus lopende quests van spelers gaan gewoon door.
function normalizeQuest(quest) {
  if (!quest || typeof quest !== "object") return null;
  if (quest.graph === true) return quest;
  if (normalizedQuests.has(quest)) return normalizedQuests.get(quest);
  const list = sortedQuestSteps(quest);
  const steps = list.map(function (step, index) {
    const following = stepById(quest, step.nextStepRef) || list[index + 1] || null;
    const objectives = (Array.isArray(step.objectives) ? step.objectives : []).map(function (objective) {
      return Object.assign({}, objective, {
        id: objectiveIdOf(objective),
        objectiveType: objective.objectiveType === OBJECTIVE_TYPES.REACH ? "talk" : objective.objectiveType,
        role: "required"
      });
    });
    return Object.assign({}, step, { kind: "step", match: "all", objectives, next: [{ to: following ? following.id : "end" }] });
  });
  steps.push({ id: "end", kind: "end", displayName: "Klaar", instruction: "", match: "all", objectives: [], next: [], conditions: [], rewards: [] });
  const result = Object.assign({}, quest, {
    graph: true,
    steps,
    stepsById: Object.fromEntries(steps.map(function (step) { return [step.id, step]; })),
    startStepRef: stepById(quest, quest.startStepRef)?.id || steps[0].id,
    version: quest.version || "legacy_" + crypto.createHash("sha256").update(JSON.stringify(quest)).digest("hex").slice(0, 16)
  });
  normalizedQuests.set(quest, result);
  return result;
}

// Stap 7: items en geld van een einde waaruit de speler er 1 kiest (XP krijgt hij altijd).
function pickableRewards(step) {
  return (Array.isArray(step?.rewards) ? step.rewards : []).filter((action) => action?.actionKind === "item" || action?.actionKind === "currency");
}

function needsRewardPick(step) {
  return step?.kind === "end" && step.rewardPick === true && pickableRewards(step).length >= 2;
}

function firstNextStep(quest, step) {
  for (const link of Array.isArray(step?.next) ? step.next : []) {
    const next = stepById(quest, link?.to);
    if (next) return next;
  }
  return null;
}

export class Node04QuestRuntimeService {
  constructor(db, repository, mmoService, node03RuntimeService) {
    this.db = db;
    this.repository = repository;
    this.mmoService = mmoService;
    this.node03RuntimeService = node03RuntimeService;
    this.versionCache = new Map();
    this.savepointSeq = 0;
    // Quest Builder: versla / verzamel / pak op komen hier binnen (zelfde transactie als de actie).
    if (node03RuntimeService) node03RuntimeService.questEvents = (ctx, playerIds, event) => this.onQuestEvent(ctx, playerIds, event);
    // Stap 2: groep verlaten (node05 roept dit aan vóór het verlaten, zodat het team nog bekend is).
    if (node03RuntimeService) node03RuntimeService.questPartyLeaving = (ctx, playerId) => this.onPartyLeaving(ctx, playerId);
    // Stap 2: quest delen met je groep. Kort geldig (2 minuten), alleen in het geheugen: na een herstart opnieuw delen.
    this.shareOffers = new Map(); // playerId -> Map(questId -> { fromId, fromName, until })
    // Stap 4: een brief (of ander item) lezen start een quest; en wie welk startgebied al binnen was (alleen binnenlopen telt).
    if (node03RuntimeService) node03RuntimeService.questUseItem = (ctx, itemId, operationId) => this.useQuestItem(ctx, itemId, operationId);
    if (node03RuntimeService) node03RuntimeService.questPickupBlocked = (ctx, itemId) => this.pickupBlockedReason(ctx, itemId);
    this.startAreaInside = new Map(); // playerId|questId -> true/false
    // Stap 5: de vijandenserver vraagt elke 2 s wie een quest-groep nog nodig heeft; na uitloggen weg = regels mogen opnieuw.
    const actors = mmoService?.actorRuntime;
    if (actors) {
      actors.questKeeper = (group) => this.questSpawnNeeds(group);
      actors.questReleased = (group) => this.releaseSpawnRules(group);
    }
    // Stap 6: klok (tests zetten een nep-klok) en welke spelers een lopende questklok hebben (playerId|questId).
    this.clock = () => Date.now();
    this.timers = new Set();
    this.timersLoaded = false;
    if (typeof mmoService?.getConnectionForPlayer === "function") {
      this.timerTick = setInterval(() => {
        try { this.tickTimers(); } catch (error) { console.warn("[quest] klok:", error?.message || error); }
      }, TIMER_TICK_MS);
      this.timerTick.unref?.();
    }
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
    this.autoStartQuests(ctx);
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
    const operationId = safeString(payload.operationId || payload.operation_id, "") || randomId("node04_operation");
    const hash = normalizedActionPayloadHash(action, payload);
    if (action === "reset_quest" || action === "reset_node04" || action === "dev_set_step") assertDeveloperActionAllowed(ctx);
    // F2-E2-T08: queststatus, beloning en receipt in een transactie; ACK pas na COMMIT.
    return runOperation(this.db, {
      operationId,
      playerId: ctx.profile.id,
      operationType: action || "unknown",
      requestHash: hash,
      label: "Deze questactie",
      faultHook: this.operationFaultHook || null,
      perform: () => {
        this.ensureRuntime(ctx);
        let result;
        if (action === "start_dialogue") result = this.startDialogue(ctx, payload);
        else if (action === "choose_dialogue") result = this.chooseDialogue(ctx, payload, operationId);
        else if (action === "choose_reward") result = this.chooseReward(ctx, safeString(payload.questId || payload.quest_id), safeString(payload.choiceId || payload.choice_id), operationId);
        else if (action === "accept_quest") result = this.acceptQuest(ctx, safeString(payload.questId || payload.quest_id), operationId, "player_accept");
        else if (action === "turn_in") result = this.turnInQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "reach") result = this.completeReachQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "track") result = this.trackQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "abandon") result = this.abandonQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "share") result = this.shareQuest(ctx, safeString(payload.questId || payload.quest_id));
        else if (action === "accept_share") result = this.acceptSharedQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "decline_share") result = this.declineSharedQuest(ctx, safeString(payload.questId || payload.quest_id));
        else if (action === "reset_quest") result = this.resetQuest(ctx, safeString(payload.questId || payload.quest_id), operationId);
        else if (action === "reset_node04") result = this.resetNode04(ctx);
        else if (action === "dev_set_step") result = this.devSetStep(ctx, safeString(payload.questId || payload.quest_id), safeString(payload.stepId || payload.step_id), operationId);
        else {
          const error = new Error("Onbekende questactie.");
          error.status = 400;
          throw error;
        }
        return result;
      },
      buildResponse: (result) => Object.assign({ ok: true, operationId }, result, { snapshot: this.snapshotForRequestFromContext(ctx) })
    });
  }

  snapshotForRequestFromContext(ctx) {
    this.ensureAvailableQuests(ctx);
    this.autoStartQuests(ctx);
    this.syncAutoProgress(ctx);
    return this.buildSnapshot(ctx);
  }

  ensureAvailableQuests(ctx) {
    const existingRows = this.loadQuestStateRows(ctx);
    const existing = new Map(existingRows.map(function (row) { return [row.quest_id, row]; }));
    for (const quest of allQuests(ctx.project)) {
      if (!quest?.id) continue;
      const row = existing.get(quest.id);
      if (!row) continue;
      if (this.shouldResetQuestForContentChange(row, quest)) {
        this.resetQuestState(ctx, quest, null, "content_changed", { forceAvailable: false });
        const refreshed = this.loadQuestState(ctx.profile.id, quest.id);
        if (refreshed) existing.set(quest.id, refreshed);
        else existing.delete(quest.id);
        continue;
      }
      this.syncQuestContentHash(ctx, row, quest);
      if (isOpenStatus(row.status) && !stateOf(row).version) this.pinQuestVersion(ctx, normalizeQuest(quest), row);
    }
    for (const quest of allQuests(ctx.project)) {
      if (!quest?.id || existing.has(quest.id)) continue;
      if (!this.questPrerequisitesMet(ctx, quest)) continue;
      this.insertQuestState(ctx, quest.id, QUEST_STATUS.AVAILABLE, null, quest.autoTrack === true ? 1 : 0, "available");
      existing.set(quest.id, { quest_id: quest.id, status: QUEST_STATUS.AVAILABLE, state_json: this.questStateJson(ctx, quest) });
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

  // Stap 4: waarom deze speler de quest (nog) niet kan beginnen. "" = mag beginnen.
  // EN: alles moet kloppen (de game noemt wat ontbreekt). OF: één is genoeg (de game noemt de keuzes).
  questStartIssue(ctx, quest) {
    const requirements = quest?.requirements;
    const rules = Array.isArray(requirements?.rules) ? requirements.rules : [];
    if (!rules.length) return "";
    const any = requirements.match === "any";
    const missing = [];
    for (const rule of rules) {
      const why = this.requirementMissing(ctx, rule);
      if (!why && any) return "";
      if (why) missing.push(why);
    }
    if (!missing.length) return "";
    return "Je kunt \"" + (quest.displayName || quest.id) + "\" nog niet beginnen. Nodig: " + missing.join(any ? " of " : " en ") + ".";
  }

  requirementMissing(ctx, rule) {
    if (rule?.type === "level") {
      const level = this.loadProgression(ctx).level;
      const min = Math.max(1, safeInteger(rule.min, 1));
      return level >= min ? "" : "level " + min + " (jij bent level " + level + ")";
    }
    if (rule?.type === "item") {
      const need = Math.max(1, safeInteger(rule.amount, 1));
      return this.node03RuntimeService.ownedItemCount(ctx.profile.id, rule.itemRef) >= need ? "" : need + "× " + displayForItem(ctx.catalogs, rule.itemRef) + " in je tas";
    }
    if (rule?.type === "quest") {
      return this.questEverCompleted(ctx.profile.id, rule.questRef) ? "" : "quest \"" + (questById(ctx.project, rule.questRef)?.displayName || rule.questRef) + "\" af";
    }
    if (rule?.type === "class") {
      const mine = safeString(this.db.prepare("SELECT selected_character_id FROM player_profiles WHERE id = ? LIMIT 1").get(ctx.profile.id)?.selected_character_id);
      return mine === rule.classRef ? "" : "klasse " + (catalogSection(ctx.catalogs, "playableCharacters")[rule.classRef]?.displayName || rule.classRef);
    }
    return "";
  }

  questEverCompleted(playerId, questId) {
    const row = this.loadQuestState(playerId, questId);
    if (row?.status === QUEST_STATUS.COMPLETED) return true;
    return Boolean(this.db.prepare("SELECT 1 FROM quest_transition_audit WHERE player_id = ? AND quest_id = ? AND to_status = 'completed' LIMIT 1").get(playerId, questId));
  }

  // Nog niet vrijgespeeld (Pas na quest): welke quest moet eerst af?
  prerequisiteMessage(ctx, quest) {
    const open = (Array.isArray(quest?.prerequisiteQuestRefs) ? quest.prerequisiteQuestRefs : [])
      .find((questId) => this.loadQuestState(ctx.profile.id, questId)?.status !== QUEST_STATUS.COMPLETED);
    return open ? "Maak eerst de quest \"" + (questById(ctx.project, open)?.displayName || open) + "\" af." : "Deze quest is nog niet vrijgespeeld.";
  }

  // Stap 4: quests die vanzelf starten (na een andere quest of zodra de voorwaarden kloppen) of als je een gebied binnenloopt.
  // Vanzelf: vanuit 'te halen' of na mislukken. Gebied: alleen bij binnenlopen (wie erin staat na verlaten, moet er eerst uit).
  autoStartQuests(ctx) {
    for (const quest of allQuests(ctx.project)) {
      if (quest?.startMode !== "auto" && quest?.startMode !== "area") continue;
      const row = this.loadQuestState(ctx.profile.id, quest.id);
      if (!row) continue;
      const waiting = row.status === QUEST_STATUS.AVAILABLE || row.status === QUEST_STATUS.ABANDONED;
      if (quest.startMode === "auto") {
        if (waiting && this.questPrerequisitesMet(ctx, quest) && !this.questStartIssue(ctx, quest)) this.startQuestFor(ctx, quest, "auto_start");
        continue;
      }
      const area = questAreaById(ctx.project, quest.startAreaRef);
      const x = Number(ctx.position?.x);
      const z = Number(ctx.position?.z);
      if (!area || !Number.isFinite(x) || !Number.isFinite(z)) continue;
      const inside = pointInArea(area.points, x, z);
      const key = ctx.profile.id + "|" + quest.id;
      const wasInside = this.startAreaInside.get(key) === true;
      this.startAreaInside.set(key, inside);
      if (!inside || wasInside) continue;
      // Stap 6: mislukt? Opnieuw het gebied in = opnieuw beginnen.
      if (!waiting && row.status !== QUEST_STATUS.FAILED && !(row.status === QUEST_STATUS.COMPLETED && questCanRepeatNow(row, quest, this.clock()))) continue;
      if (!this.questPrerequisitesMet(ctx, quest)) { this.noticePlayer(ctx.profile.id, this.prerequisiteMessage(ctx, quest)); continue; }
      const issue = this.questStartIssue(ctx, quest);
      if (issue) this.noticePlayer(ctx.profile.id, issue);
      else this.startQuestFor(ctx, quest, "area_start");
    }
  }

  startQuestFor(ctx, quest, reason) {
    try {
      this.atomic(() => this.acceptQuest(ctx, quest.id, randomId("quest_start"), reason));
      this.noticePlayer(ctx.profile.id, "Nieuwe quest: " + (quest.displayName || quest.id));
    } catch (error) {
      console.warn("[quest] starten niet gelukt:", error?.message || error);
    }
  }

  noticePlayer(playerId, text) {
    try { this.mmoService?.partyRuntime?.notice([playerId], text); } catch {}
  }

  // Stap 4: een item lezen (bijv. een brief) start de quest. Het item blijft in je tas, dus 2× lezen start hem 1×.
  // null = dit item start geen quest (dan gewoon eten/drinken zoals altijd).
  useQuestItem(ctx, itemId, operationId) {
    const quests = allQuests(ctx.project).filter((quest) => quest?.startMode === "item" && quest.startItemRef === itemId);
    if (!quests.length) return null;
    const name = displayForItem(ctx.catalogs, itemId);
    if (this.node03RuntimeService.ownedItemCount(ctx.profile.id, itemId) < 1) throw httpError(404, "Je hebt geen " + name + ".");
    this.ensureAvailableQuests(ctx);
    const started = [];
    let reason = "";
    for (const quest of quests) {
      const title = "\"" + (quest.displayName || quest.id) + "\"";
      const row = this.loadQuestState(ctx.profile.id, quest.id);
      const why = row && isOpenStatus(row.status) ? "Je bent al bezig met " + title + "."
        : row?.status === QUEST_STATUS.COMPLETED && !questCanRepeatNow(row, quest, this.clock()) ? "Je hebt " + title + " al gedaan."
          : !this.questPrerequisitesMet(ctx, quest) ? this.prerequisiteMessage(ctx, quest)
            : this.questStartIssue(ctx, quest);
      if (why) { reason = reason || why; continue; }
      this.acceptQuest(ctx, quest.id, operationId, "item_read");
      started.push(quest);
    }
    if (!started.length) throw httpError(409, reason);
    this.pingQuest([ctx.profile.id]);
    return { action: "use", message: "Quest aangenomen: " + started.map((quest) => quest.displayName || quest.id).join(", ") + ".",
      events: started.map((quest) => ({ type: "quest_accepted", questId: quest.id })), grants: [] };
  }

  // Stap 4: een brief die een quest start pak je niet op als je die quest al doet, of al gedaan hebt en hij maar 1× kan.
  pickupBlockedReason(ctx, itemId) {
    const quests = allQuests(ctx.project).filter((quest) => quest?.startMode === "item" && quest.startItemRef === itemId);
    if (!quests.length) return "";
    let reason = "";
    for (const quest of quests) {
      const row = this.loadQuestState(ctx.profile.id, quest.id);
      const title = "\"" + (quest.displayName || quest.id) + "\"";
      if (row && isOpenStatus(row.status)) reason = reason || "Je bent al bezig met " + title + ".";
      else if (row?.status === QUEST_STATUS.COMPLETED && !questCanRepeatNow(row, quest, this.clock())) reason = reason || "Je hebt " + title + " al gedaan.";
      else return "";
    }
    return reason;
  }

  // Stap 4: questitems van deze quest (het start-item en de items uit de doelen) gaan weg als hij klaar is of verlaten wordt.
  // Het start-item (de brief) blijft bij verlaten en bij een herhaalbare quest: dan kun je opnieuw beginnen.
  removeQuestItems(ctx, quest, keepStart, operationId) {
    for (const itemId of this.questItemIds(ctx, quest, keepStart)) {
      const count = this.node03RuntimeService.ownedItemCount(ctx.profile.id, itemId);
      if (count > 0) this.node03RuntimeService.removeInventoryItem(ctx, itemId, count, "quest_item_removed", quest.id, operationId || randomId("quest_items"));
    }
  }

  // De questitems van deze quest (start-item en items uit de doelen die Questitem aan hebben).
  questItemIds(ctx, quest, keepStart = false) {
    const items = catalogSection(ctx.catalogs, "items");
    const ids = new Set();
    if (quest?.startItemRef && !keepStart) ids.add(quest.startItemRef);
    for (const step of Array.isArray(quest?.steps) ? quest.steps : []) {
      for (const objective of Array.isArray(step?.objectives) ? step.objectives : []) if (objective?.itemRef) ids.add(objective.itemRef);
    }
    return new Set(Array.from(ids).filter((itemId) => items[itemId] && (items[itemId].questItem === true || items[itemId].category === "quest")));
  }

  insertQuestState(ctx, questId, status, stepId, tracked, reason) {
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, completed_at, claimed_at, revision, state_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 1, ?, ?)
      ON CONFLICT(player_id, quest_id) DO NOTHING
    `).run(
      ctx.profile.id,
      questId,
      status,
      stepId || null,
      tracked ? 1 : 0,
      status === QUEST_STATUS.ACTIVE ? stamp : null,
      status === QUEST_STATUS.COMPLETED ? stamp : null,
      this.questStateJson(ctx, questId),
      stamp
    );
    this.audit(ctx, questId, null, status, null, stepId || null, null, reason, {});
  }

  questStateJson(ctx, questId, extra = {}) {
    const quest = typeof questId === "object" ? questId : questById(ctx.project, questId);
    const payload = Object.assign({}, extra || {});
    if (quest?.contentHash) payload.contentHash = quest.contentHash;
    return stableJson(payload);
  }

  questStateContentHash(row) {
    const state = safeJsonParse(row?.state_json || "{}", {});
    return safeString(state?.contentHash || "");
  }

  shouldResetQuestForContentChange(row, quest) {
    return quest?.resetOnContentChange === true
      && Boolean(quest.contentHash)
      && this.questStateContentHash(row) !== quest.contentHash;
  }

  syncQuestContentHash(ctx, row, quest) {
    if (!row || !quest?.contentHash || this.questStateContentHash(row) === quest.contentHash) return;
    const current = safeJsonParse(row.state_json || "{}", {});
    const next = Object.assign({}, current && typeof current === "object" ? current : {}, { contentHash: quest.contentHash });
    this.db.prepare(`
      UPDATE player_quest_states
      SET state_json = ?, updated_at = ?
      WHERE player_id = ? AND quest_id = ?
    `).run(stableJson(next), now(), ctx.profile.id, quest.id);
  }

  loadQuestStateRows(ctx) {
    return this.db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? ORDER BY updated_at ASC").all(ctx.profile.id);
  }

  loadQuestState(playerId, questId) {
    return this.db.prepare("SELECT * FROM player_quest_states WHERE player_id = ? AND quest_id = ? LIMIT 1").get(playerId, questId);
  }

  syncAutoProgress(ctx) {
    for (const row of this.loadQuestStateRows(ctx)) {
      if (!isOpenStatus(row.status)) continue;
      const quest = this.questDefinition(ctx, row.quest_id, row);
      if (!quest) continue;
      // Stap 6: de speler vraagt iets = hij is online (een gepauzeerde klok loopt weer); te laat = eerst dat.
      if (stateOf(row).timer && this.atomic(() => this.checkTimer(ctx, quest, row, true))) continue;
      this.advanceQuest(ctx, quest, row, null);
    }
  }

  // Alles of niets: voortgang, stapwissel en beloning samen. Werkt ook buiten een runOperation
  // (bij het ophalen van de stand); binnen een transactie is het een geneste savepoint.
  atomic(fn) {
    this.savepointSeq = (this.savepointSeq || 0) + 1;
    const name = "quest_sp_" + this.savepointSeq;
    this.db.exec("SAVEPOINT " + name);
    try {
      const result = fn();
      this.db.exec("RELEASE " + name);
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK TO " + name);
      this.db.exec("RELEASE " + name);
      throw error;
    }
  }

  // De questversie waarmee deze speler begon. Nieuwe versie in de build? Dan maakt hij deze run af op zijn oude versie.
  questDefinition(ctx, questId, row) {
    const current = normalizeQuest(questById(ctx.project, questId));
    const version = safeString(stateOf(row).version);
    if (!version || current?.version === version) return current;
    const key = questId + "|" + version;
    if (!this.versionCache.has(key)) {
      const stored = this.db.prepare("SELECT definition_json FROM quest_versions WHERE quest_id = ? AND version = ? LIMIT 1").get(questId, version);
      this.versionCache.set(key, stored ? normalizeQuest(safeJsonParse(stored.definition_json, null)) : null);
    }
    return this.versionCache.get(key) || current;
  }

  rememberQuestVersion(quest) {
    this.db.prepare("INSERT OR IGNORE INTO quest_versions (quest_id, version, definition_json, created_at) VALUES (?, ?, ?, ?)")
      .run(quest.id, quest.version, JSON.stringify(quest), now());
  }

  // Lopende quest van voor de Quest Builder: vastzetten op de huidige versie (zelfde stap-ID's), niets terugzetten.
  pinQuestVersion(ctx, quest, row) {
    this.rememberQuestVersion(quest);
    const state = Object.assign(stateOf(row), { version: quest.version, runId: stateOf(row).runId || randomId("run") });
    this.db.prepare("UPDATE player_quest_states SET state_json = ?, updated_at = ? WHERE player_id = ? AND quest_id = ?")
      .run(stableJson(state), now(), ctx.profile.id, quest.id);
    row.state_json = stableJson(state);
  }

  // 1x per sleutel per speler per quest (gebeurtenis of beloning). Tweede keer: false.
  claimOnce(playerId, questId, key, type) {
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO player_quest_event_receipts (player_id, quest_id, event_id, event_type, payload_hash, consumed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(playerId, questId, key, type, key, now());
    return Number(result.changes) === 1;
  }

  loadObjectiveProgress(playerId, questId, stepId) {
    const rows = this.db.prepare("SELECT * FROM player_objective_progress WHERE player_id = ? AND quest_id = ? AND step_id = ?").all(playerId, questId || "", stepId || "");
    return new Map(rows.map(function (row) { return [row.objective_id, row]; }));
  }

  // done: null = klaar als current >= required; true/false = zelf bepaald (team: pas klaar als het team klaar is).
  writeObjectiveProgress(playerId, questId, stepId, objectiveId, current, required, done = null) {
    this.db.prepare(`
      INSERT INTO player_objective_progress (player_id, quest_id, step_id, objective_id, current_value, required_value, status, revision, progress_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, '{}', ?)
      ON CONFLICT(player_id, quest_id, step_id, objective_id) DO UPDATE SET
        current_value = excluded.current_value,
        required_value = excluded.required_value,
        status = excluded.status,
        revision = player_objective_progress.revision + 1,
        updated_at = excluded.updated_at
    `).run(playerId, questId, stepId, objectiveId, current, required, (done === null ? current >= required : done) ? OBJECTIVE_STATUS.COMPLETED : OBJECTIVE_STATUS.ACTIVE, now());
  }

  // Stap klaar? Dan via de eerste overgang naar de volgende stap. Een einde: quest klaar + beloning (1x per run).
  advanceQuest(ctx, quest, row, operationId) {
    return this.atomic(() => {
      let current = Object.assign({}, row);
      let step = current.active_step_id ? stepById(quest, current.active_step_id) : stepById(quest, quest.startStepRef);
      const events = [];
      for (let hop = 0; step && hop < MAX_STEP_HOPS; hop += 1) {
        if (step.kind === "end") {
          // Stap 7: de speler kiest eerst zijn beloning (in het questboek).
          if (needsRewardPick(step)) return this.waitForRewardPick(ctx, quest, current, step, operationId, events);
          return this.completeQuestRun(ctx, quest, current, step, operationId, events);
        }
        const progress = this.evaluateStepProgress(ctx, quest, step);
        const teamDone = [];
        for (const objective of progress.objectives) {
          if (objective.reachedNow) this.writeObjectiveProgress(ctx.profile.id, quest.id, step.id, objective.objectiveId, 1, 1);
          if (objective.teamReachedNow) teamDone.push(objective);
        }
        // Team samen gehaald: voor alle teamleden tegelijk klaar (ieder zijn eigen bonnetje), daarna gaan zij ook door.
        for (const objective of teamDone) this.finishTeamObjective(ctx, quest, step, objective, operationId);
        // Stap 6: de klok van deze stap (als hij start zodra de stap begint).
        if (step.timer) this.startStepTimer(ctx, quest, step, "step");
        // Stap 5: Als → Dan (de stap begint, een doel staat op een aantal, de stap is klaar).
        this.fireStepRules(ctx, quest, current, step, progress, operationId);
        if (!progress.complete) break;
        // Stap 6: gehaald, de klok van deze stap is klaar.
        if (step.timer) this.writeTimer(ctx.profile.id, quest.id, null);
        // Stap 7: na een keuze gaat de quest naar de stap van het gekozen antwoord.
        const next = this.choiceNextStep(ctx.profile.id, quest, step) || firstNextStep(quest, step);
        if (!next) return this.completeQuestRun(ctx, quest, current, null, operationId, events);
        // Een stap die je (opnieuw) binnenkomt begint leeg (ook zijn regels gaan weer 1×).
        this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ? AND step_id = ?").run(ctx.profile.id, quest.id, next.id);
        this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND event_id LIKE ?").run(ctx.profile.id, quest.id, "rule:%:" + next.id + ":%");
        this.updateQuestState(ctx, quest.id, QUEST_STATUS.ACTIVE, next.id, current.status, step.id, "step_complete", { operationId: operationId || null });
        events.push({ type: "quest_step", questId: quest.id, stepId: next.id });
        current = Object.assign(current, { status: QUEST_STATUS.ACTIVE, active_step_id: next.id });
        step = next;
      }
      return { completed: false, events, grants: [] };
    });
  }

  // ---- Stap 5: Als → Dan --------------------------------------------------------------------------------------
  // Elke regel gaat 1× per keer dat deze speler de stap binnenkomt (bonnetje rule:<run>:<stap>:<regel>).
  fireStepRules(ctx, quest, row, step, progress, operationId) {
    const rules = Array.isArray(step?.rules) ? step.rules : [];
    if (!rules.length) return;
    const runId = safeString(stateOf(row).runId, "run_" + safeString(row?.accepted_at, "legacy"));
    for (const rule of rules) {
      if (!rule?.id || !this.ruleTriggered(rule, progress)) continue;
      const key = "rule:" + runId + ":" + step.id + ":" + rule.id;
      if (this.db.prepare("SELECT 1 FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND event_id = ? LIMIT 1").get(ctx.profile.id, quest.id, key)) continue;
      if (!this.claimOnce(ctx.profile.id, quest.id, key, "quest_rule")) continue;
      // Een fout in een regel mag de quest nooit tegenhouden.
      try { this.runRule(ctx, quest, step, rule); } catch (error) { console.warn("[quest] regel niet uitgevoerd:", error?.message || error); }
    }
  }

  ruleTriggered(rule, progress) {
    if (rule.when === "start") return true;
    if (rule.when === "done") return progress?.complete === true;
    if (rule.when === "count") {
      const objective = (progress?.objectives || []).find((entry) => entry.objectiveId === rule.objectiveRef);
      return Boolean(objective) && (objective.complete === true || safeInteger(objective.currentValue, 0) >= Math.max(1, safeInteger(rule.amount, 1)));
    }
    return false;
  }

  runRule(ctx, quest, step, rule) {
    if (rule.then === "timer_start") { this.startStepTimer(ctx, quest, step, "rule"); return; }
    if (rule.then === "timer_stop") { this.stopStepTimer(ctx, quest, step); return; }
    if (rule.then === "message") {
      const text = safeString(rule.text).trim();
      if (text) this.questMessage([ctx.profile.id], quest, text);
      return;
    }
    if (rule.then !== "spawn") return;
    const spawn = (Array.isArray(quest.spawns) ? quest.spawns : []).find((entry) => entry?.id === rule.spawnRef);
    const runtime = this.mmoService?.actorRuntime;
    if (!spawn || !runtime || typeof runtime.spawnQuestGroup !== "function") return;
    const place = this.spawnPlace(ctx, spawn);
    if (!place) return;
    runtime.spawnQuestGroup({ worldId: ctx.worldId, questId: quest.id, spawnId: spawn.id, stepId: step.id, ruleId: rule.id, audience: spawn.audience,
      despawn: spawn.despawn, playerId: ctx.profile.id, actorId: spawn.actorRef, count: spawn.count, center: place.center, around: place.around });
  }

  // In het Questgebied (rond het midden), of rond de speler die de regel liet gaan.
  spawnPlace(ctx, spawn) {
    const area = spawn.areaRef ? questAreaById(ctx.project, spawn.areaRef) : null;
    const points = Array.isArray(area?.points) ? area.points.filter((point) => Number.isFinite(Number(point?.x)) && Number.isFinite(Number(point?.z))) : [];
    if (points.length >= 3) {
      const center = { x: points.reduce((sum, point) => sum + Number(point.x), 0) / points.length, z: points.reduce((sum, point) => sum + Number(point.z), 0) / points.length };
      return { center, around: Math.min(8, 2 + safeInteger(spawn.count, 1) * 0.6) };
    }
    let position = ctx.position && Number.isFinite(Number(ctx.position.x)) ? ctx.position : null;
    if (!position) {
      try { position = (this.mmoService?.getWorldPlayerStates?.(ctx.worldId) || []).find((state) => state?.player_id === ctx.profile.id) || null; } catch { position = null; }
    }
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.z))) return null;
    return { center: { x: Number(position.x), z: Number(position.z) }, around: 7 };
  }

  // Bericht in beeld (na de transactie, zoals het seintje).
  questMessage(playerIds, quest, text) {
    const ids = (playerIds || []).filter(Boolean);
    if (!ids.length || typeof this.mmoService?.sendToPlayer !== "function") return;
    const payload = { type: "quest:message", questId: quest.id, title: quest.displayName || quest.id, text: text.slice(0, 200) };
    setTimeout(() => {
      for (const id of ids) { try { this.mmoService.sendToPlayer(id, payload); } catch {} }
    }, 30);
  }

  // Wie heeft deze quest-groep nog? open = quest nog bezig (mag hem blijven zien); need = houdt hem in de wereld.
  questSpawnNeeds(group) {
    const open = [];
    const need = [];
    for (const playerId of group.members) {
      const row = this.loadQuestState(playerId, group.questId);
      if (!row || !isOpenStatus(row.status)) continue;
      open.push(playerId);
      if (group.despawn === "step" && row.active_step_id !== group.stepId) continue;
      need.push(playerId);
    }
    return { open, need };
  }

  // Na uitloggen weg: wie nog op die stap staat, kan de regel opnieuw laten gaan (geen kopie; de normale start van de stap).
  releaseSpawnRules(group) {
    if (!group?.stepId || !group?.ruleId) return;
    for (const playerId of group.members) {
      this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND event_id LIKE ?")
        .run(playerId, group.questId, "rule:%:" + group.stepId + ":" + group.ruleId);
    }
  }

  // ---- Stap 6: de klok van een stap ------------------------------------------------------------------------------
  // In state_json.timer: { stepId, endsAt, pause?, pausedAt?, stopped? }. De server beslist; de game toont alleen de aftelklok.
  writeTimer(playerId, questId, timer) {
    const row = this.loadQuestState(playerId, questId);
    if (!row) return;
    const state = stateOf(row);
    if (!timer && !state.timer) return;
    if (timer) state.timer = timer; else delete state.timer;
    this.db.prepare("UPDATE player_quest_states SET state_json = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND quest_id = ?")
      .run(stableJson(state), now(), playerId, questId);
    const key = playerId + "|" + questId;
    if (timer && timer.endsAt && !timer.stopped) this.timers.add(key); else this.timers.delete(key);
  }

  // how: "step" = de stap begint (alleen als de klok dan start), "rule" = een regel start hem.
  // Eén klok voor de groep: wie op dezelfde stap staat krijgt dezelfde eindtijd (ook wie later in de stap komt).
  startStepTimer(ctx, quest, step, how) {
    const spec = step?.timer;
    if (!spec || !(safeInteger(spec.seconds, 0) > 0)) return;
    if (how === "step" && spec.start === "rule") return;
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    if (!row || !isOpenStatus(row.status) || row.active_step_id !== step.id) return;
    if (stateOf(row).timer?.stepId === step.id) return;
    let endsAt = this.clock() + safeInteger(spec.seconds, 0) * 1000;
    let ids = [ctx.profile.id];
    if (spec.share === "group") {
      ids = this.teamMembers(ctx.profile.id, quest.id, quest.version, step.id).ids;
      for (const id of ids) {
        const other = stateOf(this.loadQuestState(id, quest.id)).timer;
        if (other?.stepId === step.id && other.endsAt && !other.stopped) { endsAt = other.endsAt; break; }
      }
    }
    // Alleen een eigen klok kan stilstaan bij uitloggen; de groepsklok loopt altijd door.
    const pause = spec.logout === "pause" && spec.share !== "group";
    for (const id of ids) {
      if (id !== ctx.profile.id && stateOf(this.loadQuestState(id, quest.id)).timer?.stepId === step.id) continue;
      this.writeTimer(id, quest.id, pause ? { stepId: step.id, endsAt, pause: true } : { stepId: step.id, endsAt });
    }
    const mates = ids.filter((id) => id !== ctx.profile.id);
    if (mates.length) this.pingQuest(mates);
  }

  stopStepTimer(ctx, quest, step) {
    const ids = step?.timer?.share === "group" ? this.teamMembers(ctx.profile.id, quest.id, quest.version, step.id).ids : [ctx.profile.id];
    for (const id of ids) {
      const timer = stateOf(this.loadQuestState(id, quest.id)).timer;
      if (timer?.stepId === step.id && !timer.stopped) this.writeTimer(id, quest.id, { stepId: step.id, stopped: true });
    }
    const mates = ids.filter((id) => id !== ctx.profile.id);
    if (mates.length) this.pingQuest(mates);
  }

  // Pauze bij uitloggen (eigen klok), verder lopen als hij terug is, en te laat. true = er is iets met de quest gebeurd.
  checkTimer(ctx, quest, row, online) {
    const timer = stateOf(row).timer;
    if (!timer || !timer.endsAt || timer.stopped) return false;
    const step = stepById(quest, row.active_step_id);
    if (!step?.timer || step.id !== timer.stepId || !isOpenStatus(row.status)) { this.writeTimer(ctx.profile.id, quest.id, null); return false; }
    const nowMs = this.clock();
    if (timer.pause && !online) {
      if (!timer.pausedAt) this.writeTimer(ctx.profile.id, quest.id, Object.assign({}, timer, { pausedAt: nowMs }));
      return false;
    }
    if (timer.pausedAt) {
      this.writeTimer(ctx.profile.id, quest.id, { stepId: timer.stepId, endsAt: timer.endsAt + Math.max(0, nowMs - timer.pausedAt), pause: true });
      return false;
    }
    if (nowMs < timer.endsAt) return false;
    this.timeUp(ctx, quest, row, step);
    return true;
  }

  timeUp(ctx, quest, row, step) {
    const operationId = randomId("quest_timer");
    const playerId = ctx.profile.id;
    this.writeTimer(playerId, quest.id, null);
    const late = step.timer.late;
    const to = late === "step" ? stepById(quest, step.timer.lateTo) : null;
    let text;
    if (late === "restart" || to) {
      // Opnieuw (of naar de andere stap): die stap begint leeg, zijn regels gaan weer 1×, de klok begint opnieuw.
      const target = to || step;
      this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ? AND step_id = ?").run(playerId, quest.id, target.id);
      this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND event_id LIKE ?").run(playerId, quest.id, "rule:%:" + target.id + ":%");
      this.updateQuestState(ctx, quest.id, QUEST_STATUS.ACTIVE, target.id, row.status, step.id, to ? "timer_late_step" : "timer_restart", { operationId });
      this.advanceQuest(ctx, quest, this.loadQuestState(playerId, quest.id), operationId);
      text = to ? "⏱️ Te laat!" : "⏱️ Te laat! De stap begint opnieuw.";
    } else {
      this.failQuest(ctx, quest, row, operationId, "timer_late");
      text = "⏱️ Te laat! De quest is mislukt. Probeer het opnieuw in je questboek (↻ Opnieuw).";
    }
    this.questMessage([playerId], quest, text);
    this.pingQuest([playerId]);
  }

  // Mislukt: voortgang weg (de verschijningen gaan vanzelf weg), questitems weg; ↻ Opnieuw in het questboek = nieuwe run.
  failQuest(ctx, quest, row, operationId, reason) {
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND (event_id LIKE 'ev:%' OR event_id LIKE 'rule:%')").run(ctx.profile.id, quest.id);
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.FAILED, row.active_step_id, row.status, row.active_step_id, reason, { operationId });
    this.removeQuestItems(ctx, quest, true, operationId);
  }

  // Elke seconde: lopende klokken (ook van spelers die niets doen of offline zijn).
  tickTimers() {
    if (!this.timersLoaded) {
      this.timersLoaded = true;
      for (const row of this.db.prepare("SELECT player_id, quest_id FROM player_quest_states WHERE status IN ('active', 'ready_to_turn_in') AND state_json LIKE '%\"timer\"%'").all()) {
        this.timers.add(row.player_id + "|" + row.quest_id);
      }
    }
    for (const key of Array.from(this.timers)) {
      const [playerId, questId] = key.split("|");
      const row = this.loadQuestState(playerId, questId);
      const timer = stateOf(row).timer;
      if (!row || !isOpenStatus(row.status) || !timer?.endsAt || timer.stopped) { this.timers.delete(key); continue; }
      const online = Boolean(this.mmoService?.getConnectionForPlayer?.(playerId));
      // Niets te doen? Dan ook geen context bouwen.
      const due = !timer.pausedAt && this.clock() >= timer.endsAt;
      if (!due && !(timer.pause && online === Boolean(timer.pausedAt))) continue;
      try {
        const ctx = this.node03RuntimeService.adminContextForPlayer(playerId);
        ctx.campaigns = campaignPackage(ctx.project);
        const quest = this.questDefinition(ctx, questId, row);
        if (quest) this.atomic(() => this.checkTimer(ctx, quest, row, online));
      } catch (error) {
        console.warn("[quest] klok van " + playerId + " niet verwerkt:", error?.message || error);
      }
    }
  }

  timerView(row, step) {
    const timer = stateOf(row).timer;
    if (!step?.timer || !timer || timer.stepId !== step.id) return null;
    if (timer.stopped) return { stopped: true };
    const left = timer.pausedAt ? timer.endsAt - timer.pausedAt : timer.endsAt - this.clock();
    return { leftMs: Math.max(0, left), totalMs: safeInteger(step.timer.seconds, 0) * 1000, paused: Boolean(timer.pausedAt), share: step.timer.share || "personal",
      late: step.timer.late || "fail" };
  }

  // pick: bij "Speler kiest 1" de gekozen beloning (XP van het einde en de beloning van de quest komen er altijd bij).
  completeQuestRun(ctx, quest, row, endStep, operationId, events = [], pick = null) {
    const opId = operationId || randomId("quest_progress");
    const runId = safeString(stateOf(row).runId, "run_" + safeString(row.accepted_at, "legacy"));
    const grants = [];
    if (this.claimOnce(ctx.profile.id, quest.id, "reward:" + runId, "quest_reward")) {
      const endRewards = Array.isArray(endStep?.rewards) ? endStep.rewards : [];
      const fromEnd = needsRewardPick(endStep) ? endRewards.filter((action) => !pickableRewards(endStep).includes(action)).concat(pick ? [pick] : []) : endRewards;
      const actions = fromEnd.concat(Array.isArray(quest.rewards) ? quest.rewards : []);
      for (const action of actions) grants.push.apply(grants, this.executeAction(ctx, action, opId, quest.id));
      // Kevin 6-11: net als level omhoog een feestelijke melding in beeld (1x per keer dat je hem haalt).
      this.questDoneNotice(ctx, quest, endStep, actions);
    }
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.COMPLETED, endStep?.id || null, row.status, row.active_step_id, "quest_complete", { operationId: opId, endId: endStep?.id || null, grants });
    this.removeQuestItems(ctx, quest, questRepeatMode(quest) !== "once_per_character", opId);
    // Gebeurtenis-bonnetjes van deze run zijn niet meer nodig (de beloning-bon blijft).
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND (event_id LIKE 'ev:%' OR event_id LIKE 'rule:%')").run(ctx.profile.id, quest.id);
    this.node03RuntimeService.recordGameplayEvent(ctx, "quest_completed", "player", quest.id, { endId: endStep?.id || null, grants });
    for (const nextQuestId of Array.isArray(quest.nextQuestRefs) ? quest.nextQuestRefs : []) {
      if (!questById(ctx.project, nextQuestId)) continue;
      grants.push.apply(grants, this.executeAction(ctx, { actionKind: "start_quest", questRef: nextQuestId, mode: "activate", reason: "quest_unlock" }, opId, quest.id));
    }
    events.push({ type: "quest_completed", questId: quest.id, endId: endStep?.id || null });
    return { completed: true, events, grants, message: "Quest voltooid: " + (quest.displayName || quest.id) };
  }

  // "Quest voltooid!" in beeld, met het einde (als het een naam heeft) en wat je kreeg. Na de transactie, zoals het bericht in beeld.
  questDoneNotice(ctx, quest, endStep, actions) {
    if (typeof this.mmoService?.sendToPlayer !== "function") return;
    const rewards = actions.map((action) => {
      if (action?.actionKind === "xp" && safeInteger(action.amount, 0) > 0) return "+" + safeInteger(action.amount, 0) + " XP";
      if (action?.actionKind === "currency") return "+" + safeInteger(action.amountMinor, 0) + " " + displayForCurrency(ctx.catalogs, action.currencyRef);
      if (action?.actionKind === "item") return "+" + safeInteger(action.amount, 1) + "× " + displayForItem(ctx.catalogs, action.itemRef);
      return null;
    }).filter(Boolean).slice(0, 6);
    // Het einde alleen noemen als de quest er meer heeft (na een keuze).
    const ends = (Array.isArray(quest.steps) ? quest.steps : []).filter((step) => step?.kind === "end").length;
    const ending = ends > 1 && endStep?.displayName && endStep.displayName !== endStep.id ? endStep.displayName : "";
    const payload = { type: "quest:completed", questId: quest.id, title: quest.displayName || quest.id, ending, rewards };
    const playerId = ctx.profile.id;
    setTimeout(() => { try { this.mmoService.sendToPlayer(playerId, payload); } catch {} }, 30);
  }

  // ---- Stap 7: beloning kiezen bij een einde ------------------------------------------------------------------
  // De quest wacht op het einde (klaar om in te leveren) tot de speler in het questboek zijn beloning kiest.
  waitForRewardPick(ctx, quest, row, endStep, operationId, events) {
    if (row.status !== QUEST_STATUS.READY_TO_TURN_IN || row.active_step_id !== endStep.id) {
      this.updateQuestState(ctx, quest.id, QUEST_STATUS.READY_TO_TURN_IN, endStep.id, row.status, row.active_step_id, "reward_pick", { operationId: operationId || null });
      events.push({ type: "quest_step", questId: quest.id, stepId: endStep.id });
    }
    return { completed: false, events, grants: [], message: "Kies je beloning in je questboek: " + (quest.displayName || quest.id) };
  }

  chooseReward(ctx, questId, choiceId, operationId) {
    const row = this.loadQuestState(ctx.profile.id, questId);
    const quest = row && isOpenStatus(row.status) ? this.questDefinition(ctx, questId, row) : null;
    const step = stepById(quest, row?.active_step_id);
    if (!quest || !needsRewardPick(step)) throw httpError(400, "Er is hier geen beloning te kiezen.");
    const pick = pickableRewards(step)[safeInteger(choiceId, -1)];
    if (!pick) throw httpError(400, "Die beloning bestaat niet.");
    return this.atomic(() => this.completeQuestRun(ctx, quest, row, step, operationId, [], pick));
  }

  // ---- Stap 7: kiezen bij een NPC ------------------------------------------------------------------------------
  // De keuze staat als questvariabele in state_json.vars["<stap>.<doel>"] = antwoord (blijft deze run vast).
  choiceNextStep(playerId, quest, step) {
    const choice = (Array.isArray(step?.objectives) ? step.objectives : []).find((objective) => objective?.objectiveType === "choose");
    if (!choice) return null;
    const options = Array.isArray(choice.options) ? choice.options : [];
    const picked = stateOf(this.loadQuestState(playerId, quest.id)).vars?.[step.id + "." + objectiveIdOf(choice)];
    // Niet gekozen (bijv. via de testknoppen): het eerste antwoord.
    const option = options.find((entry) => entry?.id === picked) || options[0];
    return option ? stepById(quest, option.to) : null;
  }

  partyLeaderId(partyId) {
    if (!partyId) return null;
    return this.db.prepare("SELECT leader_player_id FROM parties WHERE id = ? LIMIT 1").get(partyId)?.leader_player_id || null;
  }

  // Wie kiest er: ieder zelf, de leider voor het team, of de meerderheid. Team = groepsleden op dezelfde stap die nog niet kozen.
  // Alleen, of de leider staat niet op deze stap: dan kies je zelf.
  choiceTeam(ctx, quest, step, objective) {
    const decide = objective?.decide === "leader" || objective?.decide === "vote" ? objective.decide : "self";
    const alone = { decide: "self", ids: [ctx.profile.id], leaderId: null };
    if (decide === "self") return alone;
    const team = this.teamMembers(ctx.profile.id, quest.id, quest.version, step.id, objectiveIdOf(objective));
    const leaderId = this.partyLeaderId(team.partyId);
    if (team.ids.length < 2 || (decide === "leader" && !team.ids.includes(leaderId))) return alone;
    return { decide, ids: team.ids, leaderId };
  }

  choiceVotes(quest, step, objective, ids) {
    const key = step.id + "." + objectiveIdOf(objective);
    const votes = new Map();
    for (const id of ids) {
      const vote = stateOf(this.loadQuestState(id, quest.id)).votes?.[key];
      if (vote) votes.set(id, vote);
    }
    return votes;
  }

  // Meer dan de helft = beslist. Iedereen gestemd en gelijk: de stem van de leider (anders het eerste antwoord).
  voteWinner(objective, team, votes) {
    const counts = new Map();
    for (const vote of votes.values()) counts.set(vote, (counts.get(vote) || 0) + 1);
    for (const [optionId, count] of counts) if (count * 2 > team.ids.length) return optionId;
    if (votes.size < team.ids.length) return null;
    const top = Math.max(...counts.values());
    const tied = (objective.options || []).map((option) => option.id).filter((optionId) => counts.get(optionId) === top);
    const leaderVote = team.leaderId ? votes.get(team.leaderId) : null;
    return tied.includes(leaderVote) ? leaderVote : tied[0] || null;
  }

  // Het open keuzedoel bij deze NPC (stap actief, nog niet gekozen).
  openChoice(ctx, dialogue, questId, stepId, objectiveId) {
    const row = this.loadQuestState(ctx.profile.id, questId);
    if (!row || !isOpenStatus(row.status) || row.active_step_id !== stepId) throw httpError(400, "Deze questkeuze is niet meer geldig.");
    const quest = this.questDefinition(ctx, questId, row);
    const step = stepById(quest, stepId);
    const objective = (Array.isArray(step?.objectives) ? step.objectives : []).find((candidate) => objectiveIdOf(candidate) === objectiveId && candidate.objectiveType === "choose");
    if (!objective || objective.targetRef !== dialogue.targetRef) throw httpError(400, "Deze questkeuze is niet meer geldig.");
    if (this.loadObjectiveProgress(ctx.profile.id, questId, stepId).get(objectiveId)?.status === OBJECTIVE_STATUS.COMPLETED) throw httpError(400, "Hier is al gekozen.");
    return { row, quest, step, objective };
  }

  // De vraag van de NPC met de antwoorden. Al eerder gekozen (stap opnieuw): alleen dat antwoord.
  askDialogue(ctx, dialogue, quest, step, objective) {
    const objectiveId = objectiveIdOf(objective);
    const key = step.id + "." + objectiveId;
    const team = this.choiceTeam(ctx, quest, step, objective);
    const options = Array.isArray(objective.options) ? objective.options : [];
    const labelOf = (optionId) => options.find((option) => option.id === optionId)?.label || optionId;
    const fixed = stateOf(this.loadQuestState(ctx.profile.id, quest.id)).vars?.[key];
    let note = "";
    let canPick = true;
    if (team.decide === "leader") {
      canPick = ctx.profile.id === team.leaderId;
      note = canPick ? "👑 Jij kiest voor de hele groep." : "👑 De leider van je groep kiest.";
    } else if (team.decide === "vote") {
      const votes = this.choiceVotes(quest, step, objective, team.ids);
      const mine = votes.get(ctx.profile.id);
      note = "🗳️ De meerderheid beslist (" + votes.size + " van " + team.ids.length + " gestemd)." + (mine ? " Jij stemde: " + labelOf(mine) + "." : "");
    }
    const list = fixed ? options.filter((option) => option.id === fixed) : options;
    const entry = dialogue.entriesById?.[dialogue.startEntryRef] || dialogue.entries?.[0] || null;
    return {
      dialogueId: dialogue.id,
      displayName: dialogue.displayName || dialogue.id,
      targetRef: dialogue.targetRef || null,
      entryId: QUEST_ASK_PREFIX + [quest.id, step.id, objectiveId].join("|"),
      speakerName: entry?.speakerName || dialogue.displayName || "",
      text: (safeString(objective.question).trim() || "Wat kies je?") + (note ? " " + note : ""),
      choices: (canPick ? list.map((option) => ({ choiceId: QUEST_PICK_PREFIX + [quest.id, step.id, objectiveId, option.id].join("|"), label: option.label || option.id,
        action: "quest_choice", questRef: quest.id, nextEntryRef: null, closeAfterSelect: false })) : [])
        .concat([{ choiceId: QUEST_LATER_CHOICE, label: "Later", action: "close", questRef: null, nextEntryRef: null, closeAfterSelect: true }])
    };
  }

  askQuestChoice(ctx, dialogue, choiceId) {
    const [questId, stepId, objectiveId] = choiceId.slice(QUEST_ASK_PREFIX.length).split("|");
    const { quest, step, objective } = this.openChoice(ctx, dialogue, questId, stepId, objectiveId);
    return { message: "", events: [], dialogue: this.askDialogue(ctx, dialogue, quest, step, objective) };
  }

  pickQuestChoice(ctx, dialogue, choiceId, operationId) {
    const [questId, stepId, objectiveId, optionId] = choiceId.slice(QUEST_PICK_PREFIX.length).split("|");
    const { row, quest, step, objective } = this.openChoice(ctx, dialogue, questId, stepId, objectiveId);
    const options = Array.isArray(objective.options) ? objective.options : [];
    const option = options.find((entry) => entry.id === optionId);
    if (!option) throw httpError(400, "Dat antwoord bestaat niet.");
    const key = step.id + "." + objectiveId;
    const fixed = stateOf(row).vars?.[key];
    if (fixed && fixed !== option.id) throw httpError(400, "Je hebt al gekozen: " + (options.find((entry) => entry.id === fixed)?.label || fixed));
    if (!this.objectiveInRange(ctx, objective, 1.5, true)) throw httpError(400, "Je bent te ver weg.");
    return this.atomic(() => {
      const team = this.choiceTeam(ctx, quest, step, objective);
      if (team.decide === "leader" && ctx.profile.id !== team.leaderId) throw httpError(403, "De leider van je groep kiest.");
      let chosen = option;
      if (team.decide === "vote") {
        const state = stateOf(this.loadQuestState(ctx.profile.id, quest.id));
        state.votes = Object.assign({}, state.votes, { [key]: option.id });
        this.db.prepare("UPDATE player_quest_states SET state_json = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND quest_id = ?")
          .run(stableJson(state), now(), ctx.profile.id, quest.id);
        const winner = this.voteWinner(objective, team, this.choiceVotes(quest, step, objective, team.ids));
        if (!winner) {
          const others = team.ids.filter((id) => id !== ctx.profile.id);
          this.questMessage(others, quest, "🗳️ Er is gestemd. Stem mee bij " + (dialogue.displayName || "de NPC") + ".");
          this.pingQuest(others);
          return { message: "Je stem telt: " + option.label + ". Wacht op de rest van de groep.", events: [], dialogue: this.askDialogue(ctx, dialogue, quest, step, objective) };
        }
        chosen = options.find((entry) => entry.id === winner) || option;
      }
      const advanced = this.applyChoice(ctx, quest, step, objective, chosen, team, operationId, dialogue);
      const who = team.decide === "leader" ? "Je koos voor de groep: " : team.decide === "vote" ? "De groep koos: " : "Je koos: ";
      return {
        message: advanced.completed ? advanced.message : who + (chosen.label || chosen.id),
        events: [{ type: "quest_objective", questId: quest.id, stepId: step.id, objectiveId }].concat(advanced.events || []),
        grants: advanced.grants || [],
        dialogue: null
      };
    });
  }

  // De keuze geldt voor het hele team (bij ieder zelf: alleen jij). Daarna gaat ieder door naar de stap van dat antwoord.
  applyChoice(ctx, quest, step, objective, option, team, operationId, dialogue) {
    const objectiveId = objectiveIdOf(objective);
    const key = step.id + "." + objectiveId;
    const ids = team.ids.filter((memberId) => {
      const row = this.loadQuestState(memberId, quest.id);
      if (!row || !isOpenStatus(row.status) || row.active_step_id !== step.id) return false;
      const state = stateOf(row);
      state.vars = Object.assign({}, state.vars, { [key]: option.id });
      if (state.votes) { delete state.votes[key]; if (!Object.keys(state.votes).length) delete state.votes; }
      this.db.prepare("UPDATE player_quest_states SET state_json = ?, revision = revision + 1, updated_at = ? WHERE player_id = ? AND quest_id = ?")
        .run(stableJson(state), now(), memberId, quest.id);
      this.writeObjectiveProgress(memberId, quest.id, step.id, objectiveId, 1, 1);
      this.db.prepare(`
        INSERT INTO player_dialogue_choices (id, player_id, dialogue_id, entry_id, choice_id, quest_id, chosen_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(randomId("dialogue_choice"), memberId, dialogue?.id || "quest", QUEST_ASK_PREFIX + [quest.id, step.id, objectiveId].join("|"),
        QUEST_PICK_PREFIX + [quest.id, step.id, objectiveId, option.id].join("|"), quest.id, now(), stableJson({ stepId: step.id, objectiveId, optionId: option.id, by: ctx.profile.id }));
      return true;
    });
    const advanced = this.advanceQuest(ctx, quest, this.loadQuestState(ctx.profile.id, quest.id), operationId);
    const others = ids.filter((memberId) => memberId !== ctx.profile.id);
    for (const memberId of others) {
      const row = this.loadQuestState(memberId, quest.id);
      if (!row || !isOpenStatus(row.status) || row.active_step_id !== step.id) continue;
      this.advanceQuest(Object.assign({}, ctx, { profile: { id: memberId }, position: null }), quest, row, operationId);
    }
    if (others.length) {
      this.questMessage(others, quest, (team.decide === "leader" ? "👑 De leider koos: " : "🗳️ De groep koos: ") + (option.label || option.id));
      this.pingQuest(others);
    }
    return advanced;
  }

  // Het team van deze speler voor dit doel: groepsleden die dezelfde quest (zelfde versie) op dezelfde stap hebben.
  // Geen groep = alleen jijzelf. De database is de bron (ook na reconnect of herstart).
  // objectiveId: wie dit doel al af heeft, telt niet meer mee (een nieuw lid krijgt geen oude kills).
  teamMembers(playerId, questId, version, stepId, objectiveId = null) {
    const party = this.db.prepare(`
      SELECT pm.party_id FROM party_members pm JOIN parties p ON p.id = pm.party_id
      WHERE pm.player_id = ? AND pm.left_at IS NULL AND p.disbanded_at IS NULL LIMIT 1
    `).get(playerId);
    if (!party) return { partyId: null, ids: [playerId] };
    const ids = this.db.prepare(`
      SELECT q.player_id, q.state_json FROM party_members pm JOIN player_quest_states q ON q.player_id = pm.player_id
      WHERE pm.party_id = ? AND pm.left_at IS NULL AND q.quest_id = ? AND q.active_step_id = ? AND q.status IN ('active', 'ready_to_turn_in')
    `).all(party.party_id, questId, stepId).filter(function (row) {
      return safeString(stateOf(row).version) === safeString(version);
    }).map(function (row) { return row.player_id; }).filter((memberId) => {
      if (!objectiveId || memberId === playerId) return true;
      return this.loadObjectiveProgress(memberId, questId, stepId).get(objectiveId)?.status !== OBJECTIVE_STATUS.COMPLETED;
    });
    if (!ids.includes(playerId)) ids.push(playerId);
    return { partyId: party.party_id, ids: ids.sort() };
  }

  finishTeamObjective(ctx, quest, step, objective, operationId) {
    const objectiveId = objective.objectiveId;
    // Klaar = de teamstand van dat moment blijft staan (bijv. 2 / 2), ook als er later iemand bij komt.
    const teamRequired = Math.max(1, safeInteger(objective.requiredValue, requiredOf(objective)));
    for (const memberId of objective.team.memberIds) {
      this.writeObjectiveProgress(memberId, quest.id, step.id, objectiveId, teamRequired, teamRequired, true);
    }
    for (const memberId of objective.team.memberIds) {
      if (memberId === ctx.profile.id) continue;
      const row = this.loadQuestState(memberId, quest.id);
      if (!row || !isOpenStatus(row.status) || row.active_step_id !== step.id) continue;
      this.advanceQuest(Object.assign({}, ctx, { profile: { id: memberId }, position: null }), quest, row, operationId);
    }
  }

  // Aangeroepen door node03 (versla, verzamel, pak op), binnen dezelfde transactie als de actie zelf.
  // Ieder voor zich: een kill telt voor iedereen die meevocht. Team samen: een kill telt 1x voor het team.
  // Een fout in een quest mag het gevecht nooit tegenhouden.
  onQuestEvent(ctx, playerIds, event) {
    const list = (Array.isArray(playerIds) ? playerIds : []).filter(Boolean);
    // Wie de actie deed eerst: bij Team samen krijgt die de +1 voor het team.
    const ids = Array.from(new Set(list.includes(ctx.profile?.id) ? [ctx.profile.id].concat(list) : list));
    // Versla: ook de groep in de buurt, en (als het doel dat zegt) iedereen in de buurt met deze stap.
    const extra = event?.type === "defeat" ? this.nearbyCredit(ctx, ids) : { group: [], nearby: [] };
    // Stap 5: een quest-vijand telt alleen voor wie hem mag zien.
    if (typeof event?.canSee === "function") {
      extra.group = extra.group.filter((id) => event.canSee(id));
      extra.nearby = extra.nearby.filter((id) => event.canSee(id));
    }
    const recipients = ids.map((id) => [id, "fighter"])
      .concat(extra.group.map((id) => [id, "group"]), extra.nearby.map((id) => [id, "nearby"]));
    const teamTaken = new Set();
    const changed = new Set();
    for (const [playerId, via] of recipients) {
      const pctx = playerId === ctx.profile?.id ? ctx : Object.assign({}, ctx, { profile: { id: playerId }, position: null });
      try {
        for (const id of this.applyQuestEvent(pctx, event, teamTaken, via)) changed.add(id);
      } catch (error) {
        console.warn("[quest] gebeurtenis niet verwerkt:", error?.message || error);
      }
    }
    // Teamgenoten zien de nieuwe teller meteen (niet pas bij de volgende ronde).
    changed.delete(ctx.profile?.id);
    this.pingQuest(Array.from(changed));
  }

  // Groepsgenoten van deze spelers die online zijn en binnen QUEST_NEARBY_M van wie de kill maakte; en alle anderen in de buurt.
  nearbyCredit(ctx, fighterIds) {
    const result = { group: [], nearby: [] };
    const mmo = this.mmoService;
    if (!mmo || typeof mmo.getWorldPlayerStates !== "function") return result;
    let states = [];
    try { states = mmo.getWorldPlayerStates(ctx.worldId) || []; } catch { return result; }
    const byId = new Map(states.filter((state) => state?.player_id).map((state) => [state.player_id, state]));
    const killer = byId.get(ctx.profile?.id) || ctx.position || null;
    if (!killer || !Number.isFinite(Number(killer.x)) || !Number.isFinite(Number(killer.z))) return result;
    const zone = byId.get(ctx.profile?.id)?.current_zone_id || null;
    const online = (id) => { try { return Boolean(mmo.getConnectionForPlayer(id, ctx.worldId)); } catch { return false; } };
    const near = (state) => state && (!zone || !state.current_zone_id || state.current_zone_id === zone)
      && Math.hypot(Number(state.x) - Number(killer.x), Number(state.z) - Number(killer.z)) <= QUEST_NEARBY_M;
    const taken = new Set(fighterIds);
    for (const fighterId of fighterIds) {
      for (const mateId of this.partyMateIds(fighterId)) {
        if (taken.has(mateId) || !near(byId.get(mateId)) || !online(mateId)) continue;
        taken.add(mateId);
        result.group.push(mateId);
      }
    }
    for (const [playerId, state] of byId) {
      if (taken.has(playerId) || !near(state) || !online(playerId)) continue;
      taken.add(playerId);
      result.nearby.push(playerId);
    }
    return result;
  }

  partyMateIds(playerId) {
    return this.db.prepare(`
      SELECT other.player_id FROM party_members me
      JOIN parties p ON p.id = me.party_id AND p.disbanded_at IS NULL
      JOIN party_members other ON other.party_id = me.party_id AND other.left_at IS NULL AND other.player_id <> me.player_id
      WHERE me.player_id = ? AND me.left_at IS NULL
    `).all(playerId).map((row) => row.player_id);
  }

  // Seintje naar de game: haal je queststand nu op. Na de transactie (setTimeout), anders zie je nog de oude stand.
  pingQuest(playerIds) {
    const ids = (playerIds || []).filter(Boolean);
    if (!ids.length || typeof this.mmoService?.sendToPlayer !== "function") return;
    setTimeout(() => {
      for (const id of ids) { try { this.mmoService.sendToPlayer(id, { type: "quest:refresh" }); } catch {} }
    }, 30);
  }

  // via: fighter (deed zelf mee), group (groepsgenoot in de buurt), nearby (iemand anders in de buurt).
  // Geeft de spelers terug wier teller veranderde (voor het seintje).
  applyQuestEvent(ctx, event, teamTaken = new Set(), via = "fighter") {
    const changed = [];
    const refId = safeString(event?.refId);
    const key = safeString(event?.eventKey);
    if (!EVENT_OBJECTIVES.has(event?.type) || !refId || !key) return changed;
    for (const row of this.loadQuestStateRows(ctx)) {
      if (!isOpenStatus(row.status)) continue;
      const quest = this.questDefinition(ctx, row.quest_id, row);
      const step = stepById(quest, row.active_step_id);
      if (!step || step.kind === "end") continue;
      const matching = (Array.isArray(step.objectives) ? step.objectives : []).filter(function (objective) {
        return objective.objectiveType === event.type && objectiveEventRef(objective) === refId && objectiveCredits(objective, via)
          && eventInArea(ctx.project, objective, event)
          // Stap 5: Versla een verschijning = alleen de vijanden van die verschijning van deze quest.
          && (!objective.spawnRef || (event.spawn?.questId === quest.id && event.spawn?.spawnId === objective.spawnRef));
      });
      if (!matching.length) continue;
      this.atomic(() => {
        if (!this.claimOnce(ctx.profile.id, quest.id, "ev:" + key, event.type)) return;
        const stored = this.loadObjectiveProgress(ctx.profile.id, quest.id, step.id);
        for (const objective of matching) {
          const required = requiredOf(objective);
          const own = stored.get(objectiveIdOf(objective));
          const before = safeInteger(own?.current_value, 0);
          if (own?.status === OBJECTIVE_STATUS.COMPLETED) continue;
          if (objectiveIsTeam(objective)) {
            // Eén gebeurtenis = +1 voor het team, ook als meerdere teamleden meevochten.
            const team = this.teamMembers(ctx.profile.id, quest.id, quest.version, step.id, objectiveIdOf(objective));
            const teamKey = (team.partyId || ctx.profile.id) + "|" + quest.id + "|" + quest.version + "|" + step.id + "|" + objectiveIdOf(objective);
            if (teamTaken.has(teamKey)) continue;
            teamTaken.add(teamKey);
            if (before >= required * team.ids.length) continue;
            // Regel "Wachten": alleen telt een team-doel niet.
            if (quest.partyLeave === "wait" && team.ids.length < 2) continue;
            this.writeObjectiveProgress(ctx.profile.id, quest.id, step.id, objectiveIdOf(objective), before + 1, required, false);
            changed.push(...team.ids);
            continue;
          }
          if (before >= required) continue;
          this.writeObjectiveProgress(ctx.profile.id, quest.id, step.id, objectiveIdOf(objective), before + 1, required);
          changed.push(ctx.profile.id);
        }
        this.advanceQuest(ctx, quest, row, event.operationId || null);
      });
    }
    return changed;
  }

  // Groep verlaten (of eruit gezet), vóórdat het in de database staat. Regel "Quest mislukt": quests waarvan
  // je nu met een teamgenoot aan een Team samen-doel werkt, mislukken voor jou. Er wordt niets gekopieerd.
  onPartyLeaving(ctx, playerId) {
    const pctx = Object.assign({}, ctx, { profile: { id: playerId }, position: null });
    const failed = [];
    for (const row of this.loadQuestStateRows(pctx)) {
      if (!isOpenStatus(row.status)) continue;
      const quest = this.questDefinition(pctx, row.quest_id, row);
      if (quest?.partyLeave !== "fail") continue;
      const step = stepById(quest, row.active_step_id);
      if (!step || !(step.objectives || []).some(objectiveIsTeam)) continue;
      if (this.teamMembers(playerId, quest.id, quest.version, step.id).ids.length < 2) continue;
      // Een fout in een quest mag groep verlaten nooit tegenhouden.
      try {
        this.atomic(() => this.abandonQuest(pctx, quest.id, null, "party_left_fail"));
        failed.push(quest.displayName || quest.id);
      } catch (error) {
        console.warn("[quest] groep verlaten niet verwerkt:", error?.message || error);
      }
    }
    if (failed.length) {
      const text = "Quest mislukt: " + failed.join(", ") + " (je verliet de groep). Je kunt hem opnieuw aannemen bij de NPC.";
      try { this.mmoService?.partyRuntime?.notice([playerId], text); } catch {}
      this.pingQuest([playerId]);
    }
    return failed;
  }

  // Quest delen met je groep: elk groepslid dat hem nu kan aannemen krijgt een aanbod (Aannemen / Nee).
  shareQuest(ctx, questId) {
    const row = this.loadQuestState(ctx.profile.id, questId);
    const quest = questById(ctx.project, questId);
    if (!quest || !row || !isOpenStatus(row.status)) throw httpError(400, "Je kunt alleen een quest delen die je zelf doet.");
    const mates = this.partyMateIds(ctx.profile.id);
    if (!mates.length) throw httpError(400, "Je zit niet in een groep.");
    const fromName = this.db.prepare("SELECT display_name FROM player_profiles WHERE id = ? LIMIT 1").get(ctx.profile.id)?.display_name || "Iemand";
    const until = Date.now() + SHARE_OFFER_MS;
    const offered = [];
    for (const mateId of mates) {
      const mctx = Object.assign({}, ctx, { profile: { id: mateId }, position: null });
      if (!this.canTakeQuest(mctx, quest)) continue;
      if (!this.shareOffers.has(mateId)) this.shareOffers.set(mateId, new Map());
      this.shareOffers.get(mateId).set(quest.id, { fromId: ctx.profile.id, fromName, until });
      offered.push(mateId);
    }
    if (!offered.length) return { message: "Niemand in je groep kan deze quest nu aannemen.", events: [] };
    try { this.mmoService?.partyRuntime?.notice(offered, fromName + " deelt de quest \"" + (quest.displayName || quest.id) + "\". Kijk in je questboek."); } catch {}
    this.pingQuest(offered);
    return { message: "Gedeeld met " + offered.length + (offered.length === 1 ? " groepslid." : " groepsleden."), events: [{ type: "quest_shared", questId: quest.id }] };
  }

  canTakeQuest(ctx, quest) {
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    if (row && isOpenStatus(row.status)) return false;
    if (row?.status === QUEST_STATUS.COMPLETED && !questCanRepeatNow(row, quest, this.clock())) return false;
    return this.questPrerequisitesMet(ctx, normalizeQuest(quest)) && !this.questStartIssue(ctx, quest);
  }

  shareOffersFor(playerId, nowMs = Date.now()) {
    const offers = this.shareOffers.get(playerId);
    if (!offers) return [];
    for (const [questId, offer] of offers) if (offer.until <= nowMs) offers.delete(questId);
    if (!offers.size) this.shareOffers.delete(playerId);
    return Array.from(offers.entries()).map(([questId, offer]) => ({ questId, fromName: offer.fromName, leftMs: offer.until - nowMs }));
  }

  acceptSharedQuest(ctx, questId, operationId) {
    if (!this.shareOffersFor(ctx.profile.id).some((offer) => offer.questId === questId)) throw httpError(400, "Dit aanbod is verlopen. Vraag of ze de quest nog eens delen.");
    this.shareOffers.get(ctx.profile.id)?.delete(questId);
    return this.acceptQuest(ctx, questId, operationId, "shared");
  }

  declineSharedQuest(ctx, questId) {
    this.shareOffers.get(ctx.profile.id)?.delete(questId);
    return { message: "Aanbod geweigerd.", events: [] };
  }

  updateQuestState(ctx, questId, status, activeStepId, fromStatus, fromStepId, reason, extra = {}) {
    const stamp = now();
    this.db.prepare(`
      UPDATE player_quest_states
      SET status = ?,
          active_step_id = ?,
          tracked = CASE WHEN ? IN ('active', 'ready_to_turn_in') AND COALESCE(?, '') NOT IN ('active', 'ready_to_turn_in') THEN 1 ELSE tracked END,
          completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, ?) ELSE completed_at END,
          claimed_at = CASE WHEN ? = 'completed' THEN COALESCE(claimed_at, ?) ELSE claimed_at END,
          revision = revision + 1,
          updated_at = ?
      WHERE player_id = ? AND quest_id = ?
    `).run(status, activeStepId || null, status, fromStatus || null, status, stamp, status, stamp, stamp, ctx.profile.id, questId);
    this.audit(ctx, questId, fromStatus, status, fromStepId, activeStepId || null, extra.operationId || null, reason, extra);
  }

  audit(ctx, questId, fromStatus, toStatus, fromStepId, toStepId, operationId, reason, payload) {
    this.db.prepare(`
      INSERT INTO quest_transition_audit (id, player_id, quest_id, from_status, to_status, from_step_id, to_step_id, operation_id, reason, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("quest_audit"), ctx.profile.id, questId, fromStatus || null, toStatus, fromStepId || null, toStepId || null, operationId || null, reason, stableJson(payload || {}), now());
  }

  acceptQuest(ctx, questId, operationId, reason = "player_accept") {
    const quest = normalizeQuest(questById(ctx.project, questId));
    if (!quest) throw httpError(404, "Quest niet gevonden.");
    if (!this.questPrerequisitesMet(ctx, quest)) throw httpError(400, this.prerequisiteMessage(ctx, quest));
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    if (row && isOpenStatus(row.status)) return { message: "Quest is al actief.", events: [] };
    if (row?.status === QUEST_STATUS.COMPLETED && !questCanRepeatNow(row, quest, this.clock())) {
      return { message: questRepeatBlockedMessage(quest, row), events: [] };
    }
    // Stap 4: voorwaarden (level, item, quest af, klasse). De game zegt waarom niet.
    const startIssue = this.questStartIssue(ctx, quest);
    if (startIssue) throw httpError(409, startIssue);
    const start = stepById(quest, quest.startStepRef);
    if (!start || start.kind === "end") throw httpError(400, "Deze quest heeft nog geen eerste stap.");
    // Nieuwe run: schone voortgang, eigen run-ID (beloning 1x per run) en de versie waarop hij hem afmaakt.
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND (event_id LIKE 'ev:%' OR event_id LIKE 'rule:%')").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_dialogue_choices WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.rememberQuestVersion(quest);
    const stamp = now();
    const stateJson = this.questStateJson(ctx, quest, { version: quest.version, runId: randomId("run") });
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, revision, state_json, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?, 1, ?, ?)
      ON CONFLICT(player_id, quest_id) DO UPDATE SET
        status = 'active',
        active_step_id = excluded.active_step_id,
        tracked = excluded.tracked,
        accepted_at = excluded.accepted_at,
        completed_at = NULL,
        claimed_at = NULL,
        revision = player_quest_states.revision + 1,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, quest.id, start.id, quest.autoTrack !== false ? 1 : 0, stamp, stateJson, stamp);
    this.audit(ctx, quest.id, row?.status || null, QUEST_STATUS.ACTIVE, row?.active_step_id || null, start.id, operationId, reason, { version: quest.version });
    this.node03RuntimeService.recordGameplayEvent(ctx, "quest_accepted", "player", quest.id, { stepId: start.id, version: quest.version });
    const fresh = this.loadQuestState(ctx.profile.id, quest.id);
    const advanced = this.advanceQuest(ctx, quest, fresh, operationId);
    return {
      message: advanced.completed ? advanced.message : "Quest aangenomen: " + (quest.displayName || quest.id),
      events: [{ type: "quest_accepted", questId: quest.id }].concat(advanced.events || []),
      grants: advanced.grants || []
    };
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

  // Verlaten: de run stopt en de voortgang gaat weg. Opnieuw aannemen = nieuwe run op de nieuwste versie.
  abandonQuest(ctx, questId, operationId, reason = "abandon") {
    const quest = questById(ctx.project, questId);
    const row = this.loadQuestState(ctx.profile.id, questId);
    if (!quest || !row || !isOpenStatus(row.status)) throw httpError(400, "Deze quest kan niet verlaten worden.");
    // Stap 4: een quest die vanzelf start kun je niet zelf verlaten (mislukken via de groepsregel kan wel; dan begint hij opnieuw).
    if (reason === "abandon" && (quest.abandonable === false || quest.startMode === "auto")) throw httpError(400, "Deze quest kun je niet verlaten.");
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND (event_id LIKE 'ev:%' OR event_id LIKE 'rule:%')").run(ctx.profile.id, quest.id);
    this.updateQuestState(ctx, quest.id, QUEST_STATUS.ABANDONED, row.active_step_id, row.status, row.active_step_id, reason, { operationId });
    this.removeQuestItems(ctx, normalizeQuest(quest), true, operationId);
    // Wie in het startgebied staat, moet er eerst uit en weer in om opnieuw te beginnen.
    if (quest.startMode === "area") this.startAreaInside.set(ctx.profile.id + "|" + quest.id, true);
    const again = quest.startMode === "item" ? "Lees " + displayForItem(ctx.catalogs, quest.startItemRef) + " opnieuw om weer te beginnen."
      : quest.startMode === "area" ? "Loop opnieuw het gebied in om weer te beginnen." : "Je kunt hem opnieuw aannemen bij de NPC.";
    return { message: "Quest verlaten. " + again, events: [{ type: "quest_abandoned", questId: quest.id }] };
  }

  // Oude knoppen "Turn in" / "Complete" (node04:turn_in, node04:reach): zoek het inlever- of praatdoel bij deze NPC.
  turnInQuest(ctx, questId, operationId) {
    return this.completeObjectiveNearby(ctx, questId, ["deliver"], operationId);
  }

  completeReachQuest(ctx, questId, operationId) {
    return this.completeObjectiveNearby(ctx, questId, ["talk"], operationId);
  }

  completeObjectiveNearby(ctx, questId, types, operationId) {
    const row = this.loadQuestState(ctx.profile.id, questId);
    const quest = row && isOpenStatus(row.status) ? this.questDefinition(ctx, questId, row) : null;
    const step = stepById(quest, row?.active_step_id);
    if (!quest || !step || step.kind === "end") throw httpError(400, "Quest is niet actief.");
    const progress = this.evaluateStepProgress(ctx, quest, step);
    const open = progress.objectives.find((objective) => types.includes(objective.objectiveType) && !objective.complete
      && (objective.objectiveType !== "deliver" || objective.ready) && this.objectiveInRange(ctx, objective, 1.5, true));
    if (!open) throw httpError(400, progress.blockedReason || "Quest kan nog niet ingeleverd worden.");
    const objective = step.objectives.find(function (candidate) { return objectiveIdOf(candidate) === open.objectiveId; });
    return this.completeTalkObjective(ctx, quest, row, step, objective, operationId, null);
  }

  // Keuze uit het NPC-gesprek: "quest.obj|<quest>|<stap>|<doel>". Alleen geldig als die stap nu actief is.
  chooseQuestObjective(ctx, dialogue, choiceId, operationId) {
    const [questId, stepId, objectiveId] = choiceId.slice(QUEST_CHOICE_PREFIX.length).split("|");
    const row = this.loadQuestState(ctx.profile.id, questId);
    if (!row || !isOpenStatus(row.status) || row.active_step_id !== stepId) throw httpError(400, "Deze questkeuze is niet meer geldig.");
    const quest = this.questDefinition(ctx, questId, row);
    const step = stepById(quest, stepId);
    const objective = (Array.isArray(step?.objectives) ? step.objectives : []).find(function (candidate) { return objectiveIdOf(candidate) === objectiveId; });
    if (!objective || !["talk", "deliver"].includes(objective.objectiveType) || objective.targetRef !== dialogue.targetRef) {
      throw httpError(400, "Deze questkeuze is niet meer geldig.");
    }
    return this.completeTalkObjective(ctx, quest, row, step, objective, operationId, dialogue);
  }

  completeTalkObjective(ctx, quest, row, step, objective, operationId, dialogue) {
    return this.atomic(() => {
      const objectiveId = objectiveIdOf(objective);
      const stored = this.loadObjectiveProgress(ctx.profile.id, quest.id, step.id).get(objectiveId);
      if (stored?.status === OBJECTIVE_STATUS.COMPLETED) return { message: "Dat heb je al gedaan.", events: [], dialogue: null };
      if (!this.objectiveInRange(ctx, objective, 1.5, true)) throw httpError(400, "Je bent te ver weg.");
      const required = requiredOf(objective);
      if (objective.objectiveType === "deliver") this.consumeItem(ctx, objective.itemRef, required, operationId, "quest_turn_in", quest.id);
      this.writeObjectiveProgress(ctx.profile.id, quest.id, step.id, objectiveId, required, required);
      this.db.prepare(`
        INSERT INTO player_dialogue_choices (id, player_id, dialogue_id, entry_id, choice_id, quest_id, chosen_at, payload_json)
        VALUES (?, ?, ?, NULL, ?, ?, ?, ?)
      `).run(randomId("dialogue_choice"), ctx.profile.id, dialogue?.id || "quest", QUEST_CHOICE_PREFIX + [quest.id, step.id, objectiveId].join("|"), quest.id, now(), stableJson({ stepId: step.id, objectiveId }));
      const advanced = this.advanceQuest(ctx, quest, this.loadQuestState(ctx.profile.id, quest.id), operationId);
      const done = objective.objectiveType === "deliver" ? "Ingeleverd: " + (objective.displayName || quest.displayName) : "Quest bijgewerkt: " + (quest.displayName || quest.id);
      return {
        message: advanced.completed ? advanced.message : done,
        events: [{ type: "quest_objective", questId: quest.id, stepId: step.id, objectiveId }].concat(advanced.events || []),
        grants: advanced.grants || [],
        dialogue: null
      };
    });
  }

  // Binnen bereik van het doel (NPC of plek). Onbekende positie telt alleen als "ja" bij praten/inleveren (zoals vroeger).
  objectiveInRange(ctx, objective, slack = 0, allowUnknown = false) {
    const target = this.resolveQuestTarget(ctx.project, objective?.targetRef);
    if (!target) return allowUnknown;
    if (safeString(objective.zoneRef || target.zoneRef || ctx.zoneId) !== safeString(ctx.zoneId)) return false;
    const distance = positionDistance(ctx.position, target);
    if (distance === null) return allowUnknown;
    return distance <= Math.max(0.1, safeNumber(objective.radius || target.radius, 3)) + slack;
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
    // Terugbouw zonder nodes: een item als questbeloning (Quest-kaart "Beloning").
    if (action.actionKind === "item") {
      return this.node03RuntimeService.grantItem(ctx, action.itemRef, Math.max(1, safeInteger(action.amount, 1)), action.reason || "quest_reward", sourceRef, operationId);
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
      // Stap 4: kan de volgende quest nog niet beginnen (voorwaarden)? Dan staat hij klaar, de beloning gaat gewoon door.
      if (!this.questPrerequisitesMet(ctx, quest) || this.questStartIssue(ctx, quest)) {
        this.insertQuestState(ctx, quest.id, QUEST_STATUS.AVAILABLE, null, quest.autoTrack === true ? 1 : 0, action.reason || "quest_unlock");
        return [{ kind: "quest_unlocked", questId: quest.id, displayName: quest.displayName || quest.id }];
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
    if (!dialogue) throw httpError(404, "Dialogue niet gevonden.");
    const choiceId = safeString(payload.choiceId || payload.choice_id);
    if (choiceId.startsWith(QUEST_CHOICE_PREFIX)) return this.chooseQuestObjective(ctx, dialogue, choiceId, operationId);
    // Stap 7: de vraag van een quest, een antwoord, of "Later".
    if (choiceId === QUEST_LATER_CHOICE) return { message: "", events: [], dialogue: null };
    if (choiceId.startsWith(QUEST_ASK_PREFIX)) return this.askQuestChoice(ctx, dialogue, choiceId);
    if (choiceId.startsWith(QUEST_PICK_PREFIX)) return this.pickQuestChoice(ctx, dialogue, choiceId, operationId);
    const entry = dialogue.entriesById?.[payload.entryId || payload.entry_id || dialogue.startEntryRef] || dialogue.entries?.[0] || null;
    const choice = (Array.isArray(entry?.choices) ? entry.choices : []).find(function (candidate) {
      return candidate.id === choiceId;
    }) || null;
    if (!choice) throw httpError(404, "Dialogue keuze niet gevonden.");
    this.db.prepare(`
      INSERT INTO player_dialogue_choices (id, player_id, dialogue_id, entry_id, choice_id, quest_id, chosen_at, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomId("dialogue_choice"), ctx.profile.id, dialogue.id, entry?.id || null, choice.id, choice.questRef || null, now(), stableJson(choice));
    this.node03RuntimeService.recordGameplayEvent(ctx, "dialogue_choice", "player", dialogue.id, { entryId: entry?.id || null, choiceId: choice.id });
    const events = [{ type: "dialogue_choice", dialogueId: dialogue.id, choiceId: choice.id }];
    let message = "Dialogue keuze verwerkt.";
    let grants = [];
    let result = null;
    if (choice.action === "accept_quest" && choice.questRef) result = this.acceptQuest(ctx, choice.questRef, operationId, "dialogue_accept");
    else if (choice.action === "turn_in_quest" && choice.questRef) result = this.turnInQuest(ctx, choice.questRef, operationId);
    else if (choice.action === "complete_quest" && choice.questRef) result = this.completeReachQuest(ctx, choice.questRef, operationId);
    if (result) {
      events.push.apply(events, result.events || []);
      message = result.message || message;
      grants = result.grants || [];
    }
    const nextDialogue = choice.closeAfterSelect || choice.action === "close"
      ? null
      : this.buildDialogueRuntime(ctx, dialogue, choice.nextEntryRef || entry?.nextEntryRef || null);
    return { message, events, grants, dialogue: nextDialogue };
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
    const startEntryId = dialogue.startEntryRef || dialogue.entries?.[0]?.id || null;
    const choices = (Array.isArray(entry.choices) ? entry.choices : []).filter((choice) => {
      return this.evaluateConditions(ctx, choice.conditions || []).met;
    }).map((choice) => ({
      choiceId: choice.id,
      // Stap 4: een quest die je nog niet kunt beginnen krijgt een slotje; aannemen zegt waarom niet.
      label: this.resolveTokenText(ctx, choice.label || "Continue") + (this.offerLocked(ctx, choice) ? " 🔒" : ""),
      action: choice.action || "none",
      questRef: choice.questRef || null,
      nextEntryRef: choice.nextEntryRef || null,
      closeAfterSelect: choice.closeAfterSelect === true || choice.action === "accept_quest" || choice.action === "close" || choice.action === "complete_quest"
    }));
    // Quest Builder: praat- en inleverdoelen bij deze NPC staan bovenaan het begin van het gesprek.
    if (entry.id === startEntryId) choices.unshift.apply(choices, this.questChoicesFor(ctx, dialogue));
    return {
      dialogueId: dialogue.id,
      displayName: dialogue.displayName || dialogue.id,
      targetRef: dialogue.targetRef || null,
      entryId: entry.id,
      speakerName: entry.speakerName || dialogue.displayName || "",
      text: this.resolveTokenText(ctx, entry.text || ""),
      choices
    };
  }

  offerLocked(ctx, choice) {
    const questRef = (Array.isArray(choice?.conditions) ? choice.conditions : []).find((condition) => condition?.conditionType === "quest_available")?.questRef;
    const quest = questRef ? questById(ctx.project, questRef) : null;
    return Boolean(quest?.requirements) && Boolean(this.questStartIssue(ctx, quest));
  }

  questChoicesFor(ctx, dialogue) {
    const targetRef = safeString(dialogue?.targetRef);
    const choices = [];
    if (!targetRef) return choices;
    for (const row of this.loadQuestStateRows(ctx)) {
      if (!isOpenStatus(row.status)) continue;
      const quest = this.questDefinition(ctx, row.quest_id, row);
      const step = stepById(quest, row.active_step_id);
      if (!step || step.kind === "end") continue;
      for (const objective of this.evaluateStepProgress(ctx, quest, step).objectives) {
        if (objective.complete || objective.targetRef !== targetRef) continue;
        const choiceId = QUEST_CHOICE_PREFIX + [quest.id, step.id, objective.objectiveId].join("|");
        if (objective.objectiveType === "talk") {
          choices.push({ choiceId, label: "💬 " + (quest.displayName || quest.id), action: "quest_objective", questRef: quest.id, nextEntryRef: null, closeAfterSelect: true });
        } else if (objective.objectiveType === "deliver" && objective.ready) {
          choices.push({ choiceId, label: "📦 Inleveren: " + (quest.displayName || quest.id), action: "quest_objective", questRef: quest.id, nextEntryRef: null, closeAfterSelect: true });
        } else if (objective.objectiveType === "choose") {
          // Stap 7: de NPC stelt de vraag van de quest.
          choices.push({ choiceId: QUEST_ASK_PREFIX + [quest.id, step.id, objective.objectiveId].join("|"), label: "🔀 " + (quest.displayName || quest.id),
            action: "quest_choice", questRef: quest.id, nextEntryRef: null, closeAfterSelect: false });
        }
      }
    }
    return choices;
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
      return { conditionType: "group", met, message: met ? "" : (condition.failureText || "Condition group failed."), results };
    }
    if (condition.conditionType === "player_level") {
      const level = this.loadProgression(ctx).level;
      const met = compareNumbers(level, condition.comparison, safeInteger(condition.level, 1));
      return {
        conditionType: "player_level",
        comparison: condition.comparison || ">=",
        met,
        message: met ? "" : (condition.failureText || "Level " + condition.level + " nodig."),
        current: level,
        required: safeInteger(condition.level, 1)
      };
    }
    // Gesprekskeuze "quest aannemen". Inleveren en praten voor een stap zet de quest-motor zelf in het gesprek,
    // dus de oude keuzes (quest_turn_in / quest_reach_ready uit oudere builds) blijven verborgen.
    if (condition.conditionType === "quest_available" || condition.conditionType === "quest_turn_in" || condition.conditionType === "quest_reach_ready") {
      const quest = questById(ctx.project, condition.questRef);
      const row = quest ? this.loadQuestState(ctx.profile.id, quest.id) : null;
      const met = Boolean(quest && row && condition.conditionType === "quest_available"
        && (row.status === QUEST_STATUS.AVAILABLE || row.status === QUEST_STATUS.ABANDONED || row.status === QUEST_STATUS.FAILED || (row.status === QUEST_STATUS.COMPLETED && questCanRepeatNow(row, quest, this.clock()))));
      return { conditionType: condition.conditionType, questRef: condition.questRef || null, met, message: "" };
    }
    if (condition.conditionType === "has_item") {
      const amount = this.node03RuntimeService.ownedItemCount(ctx.profile.id, condition.itemRef);
      const required = Math.max(1, safeInteger(condition.amount, 1));
      return { conditionType: "has_item", itemRef: condition.itemRef || null, met: amount >= required, message: amount >= required ? "" : (condition.failureText || "Item nodig."), current: amount, required };
    }
    return { conditionType: condition.conditionType || "", met: true, message: "" };
  }

  evaluateStepProgress(ctx, quest, step) {
    const stored = this.loadObjectiveProgress(ctx.profile.id, quest?.id, step?.id);
    const scope = { questId: quest?.id, version: quest?.version, stepId: step?.id, waitAlone: quest?.partyLeave === "wait" };
    const objectives = (Array.isArray(step?.objectives) ? step.objectives : []).map((objective) => this.evaluateObjective(ctx, objective, stored.get(objectiveIdOf(objective)), scope));
    const conditions = this.evaluateConditions(ctx, step?.conditions || []);
    const needed = objectives.filter(function (objective) { return objective.needed; });
    const isDone = function (objective) { return objective.complete; };
    const objectivesComplete = needed.length > 0 && (step?.match === "any" ? needed.some(isDone) : needed.every(isDone));
    const complete = objectivesComplete && conditions.met;
    return {
      questId: quest?.id || null,
      stepId: step?.id || null,
      complete,
      conditionsMet: conditions.met,
      blockedReason: conditions.failedReason || needed.find(function (objective) { return !objective.complete; })?.message || "",
      objectives,
      conditions: conditions.results
    };
  }

  // stored = rij uit player_objective_progress. Tas-doelen kijken live naar je tas; gebeurtenis-doelen naar de teller.
  evaluateObjective(ctx, objective, stored, scope = null) {
    const type = objective?.objectiveType || "custom";
    let required = requiredOf(objective);
    const storedDone = stored?.status === OBJECTIVE_STATUS.COMPLETED;
    const label = objective?.displayName || type;
    let current = 0;
    let complete = false;
    let supported = true;
    const extra = {};
    if (type === OBJECTIVE_TYPES.COLLECT) {
      const owned = this.node03RuntimeService.ownedItemCount(ctx.profile.id, objective.itemRef);
      current = Math.min(owned, required);
      complete = owned >= required;
    } else if (type === OBJECTIVE_TYPES.DELIVER) {
      const owned = this.node03RuntimeService.ownedItemCount(ctx.profile.id, objective.itemRef);
      complete = storedDone;
      current = complete ? required : Math.min(owned, required);
      extra.ready = !complete && owned >= required;
    } else if (type === OBJECTIVE_TYPES.TALK || type === "choose") {
      complete = storedDone;
      current = complete ? 1 : 0;
    } else if (type === "visit") {
      complete = storedDone || this.objectiveInRange(ctx, objective, 0, false);
      current = complete ? 1 : 0;
      extra.reachedNow = complete && !storedDone;
    } else if (type === "enter" || type === "leave") {
      // Stap 3: de server kijkt waar je nu bent (zijn eigen positie). Eén keer gehaald = klaar, heen en weer telt niet opnieuw.
      const area = questAreaById(ctx.project, objective.areaRef);
      const known = Boolean(area) && Number.isFinite(Number(ctx.position?.x)) && Number.isFinite(Number(ctx.position?.z));
      const inside = known && pointInArea(area.points, Number(ctx.position.x), Number(ctx.position.z));
      complete = storedDone || (known && (type === "enter" ? inside : !inside));
      current = complete ? 1 : 0;
      extra.reachedNow = complete && !storedDone;
    } else if (objectiveIsTeam(objective) && scope?.questId && storedDone) {
      // Team-doel al klaar: laat de stand van toen zien, niet opnieuw rekenen met het team van nu.
      current = Math.max(1, safeInteger(stored?.required_value, required));
      required = current;
      complete = true;
    } else if (objectiveIsTeam(objective) && scope?.questId) {
      // Team samen: alle bijdragen van het team bij elkaar; doel = aantal × teamleden.
      const team = this.teamMembers(ctx.profile.id, scope.questId, scope.version, scope.stepId, objectiveIdOf(objective));
      const sum = team.ids.reduce((total, memberId) => {
        const row = memberId === ctx.profile.id ? stored : this.loadObjectiveProgress(memberId, scope.questId, scope.stepId).get(objectiveIdOf(objective));
        return total + safeInteger(row?.current_value, 0);
      }, 0);
      const perMember = required;
      required = perMember * team.ids.length;
      // Regel "Wachten": alleen (geen teamgenoot met deze stap) telt en sluit het team-doel niet.
      const waiting = scope.waitAlone === true && team.ids.length < 2 && !storedDone;
      complete = storedDone || (!waiting && sum >= required);
      current = complete ? required : Math.min(sum, required);
      extra.team = { size: team.ids.length, mine: safeInteger(stored?.current_value, 0), perMember, memberIds: team.ids, waiting };
      extra.teamReachedNow = !storedDone && !waiting && sum >= required;
    } else if (EVENT_OBJECTIVES.has(type)) {
      current = Math.min(safeInteger(stored?.current_value, 0), required);
      complete = current >= required;
    } else {
      supported = false;
    }
    const role = objective?.role || "required";
    return Object.assign({}, objective, extra, {
      objectiveId: objectiveIdOf(objective),
      objectiveType: type,
      role,
      needed: objectiveIsNeeded(objective),
      hidden: role === "hidden" && !complete,
      currentValue: current,
      requiredValue: required,
      complete,
      message: complete ? "" : !supported ? "Doel niet ondersteund." : required > 1 ? label + " " + current + "/" + required : label
    });
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
        const linked = target.linkedEntity && typeof target.linkedEntity === "object" ? target.linkedEntity : null;
        return Object.assign({}, target, {
          targetId: target.targetId || target.id,
          zoneRef: target.zoneRef || zone.zoneId,
          x: safeNumber(linked?.x, safeNumber(target.x, 0)),
          y: safeNumber(linked?.y, safeNumber(target.y, 0)),
          z: safeNumber(linked?.z, safeNumber(target.z, 0)),
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
    // Te halen = nog nooit gedaan; al eens gedaan en weer te doen = again (grijs met ↻).
    const available = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.AVAILABLE && !quest.abandoned && !quest.doneBefore; });
    const again = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.AVAILABLE && quest.doneBefore; });
    const completed = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.COMPLETED; });
    const failed = questSummaries.filter(function (quest) { return quest.status === QUEST_STATUS.FAILED; });
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
        again,
        completed,
        failed
      },
      trackedQuest,
      questTargets,
      questGivers: this.buildQuestGivers(ctx, questSummaries),
      // Stap 4: gebieden waar een quest start; de game vraagt meteen de stand op als je erin loopt.
      startAreas: this.buildStartAreas(ctx, byQuest),
      // Stap 2: quests die een groepslid met je deelde (Aannemen / Nee in het questboek).
      questShares: this.shareOffersFor(ctx.profile.id).map((offer) => {
        const quest = questById(ctx.project, offer.questId);
        return quest ? Object.assign({ displayName: quest.displayName || quest.id }, offer) : null;
      }).filter(Boolean),
      dialogueTargets: this.buildDialogueTargets(ctx),
      notifications: this.loadNotifications(ctx),
      node03,
      generatedAt: now()
    };
  }

  // De 5 dichtstbijzijnde levende vijanden (of grondstoffen) van open doelen met ⭐ Ster op kaart; met "Alleen in gebied" alleen daarbinnen.
  liveMarks(ctx, step, objectives, questId = null) {
    const runtime = this.mmoService?.actorRuntime;
    if (!runtime || typeof runtime.livePositions !== "function") return [];
    const marks = [];
    for (const objective of Array.isArray(step?.objectives) ? step.objectives : []) {
      if (objective?.mark !== "star") continue;
      const view = objectives.find((entry) => entry.objectiveId === objectiveIdOf(objective));
      if (!view || view.complete) continue;
      const kind = objective.objectiveType === "gather" ? "resource" : objective.objectiveType === "defeat" ? "actor" : null;
      const ref = kind === "resource" ? objective.resourceRef : objective.actorRef;
      if (!kind || !ref) continue;
      const area = objective.inAreaRef ? questAreaById(ctx.project, objective.inAreaRef) : null;
      // Alleen wat deze speler ziet; bij een verschijning alleen die vijanden.
      const spots = objective.spawnRef && typeof runtime.questSpawnPositions === "function"
        ? runtime.questSpawnPositions(questId, objective.spawnRef, ctx.profile.id) : runtime.livePositions(kind, ref, ctx.profile.id);
      for (const spot of spots) {
        if (area && !pointInArea(area.points, spot.x, spot.z)) continue;
        marks.push({ id: spot.id, objectiveId: view.objectiveId, x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100 });
      }
    }
    const px = Number(ctx.position?.x);
    const pz = Number(ctx.position?.z);
    if (Number.isFinite(px) && Number.isFinite(pz)) marks.sort((a, b) => Math.hypot(a.x - px, a.z - pz) - Math.hypot(b.x - px, b.z - pz));
    return marks.slice(0, 5);
  }

  buildStartAreas(ctx, byQuest) {
    const list = [];
    for (const quest of allQuests(ctx.project)) {
      if (quest?.startMode !== "area") continue;
      const row = byQuest.get(quest.id);
      if (!row || isOpenStatus(row.status) || (row.status === QUEST_STATUS.COMPLETED && !questCanRepeatNow(row, quest, this.clock()))) continue;
      const area = questAreaById(ctx.project, quest.startAreaRef);
      if (area && Array.isArray(area.points) && area.points.length >= 3) list.push({ questId: quest.id, areaId: area.id, points: area.points });
    }
    return list;
  }

  // Vanzelf-quest: de quest die je net af hebt (Quest af-voorwaarde of Pas na quest), voor de heads-up.
  afterQuestName(ctx, quest) {
    const rules = Array.isArray(quest?.requirements?.rules) ? quest.requirements.rules : [];
    const ref = rules.find((rule) => rule?.type === "quest")?.questRef || (Array.isArray(quest?.prerequisiteQuestRefs) ? quest.prerequisiteQuestRefs[0] : null);
    const before = ref ? questById(ctx.project, ref) : null;
    return before ? before.displayName || before.id : null;
  }

  buildQuestSummary(ctx, quest, row) {
    if (!quest?.id || !row) return null;
    const canRepeat = row.status === QUEST_STATUS.COMPLETED && questCanRepeatNow(row, quest, this.clock());
    // Stap 6: wanneer hij weer kan (elke dag/week, of na de wachttijd).
    const repeatAt = row.status === QUEST_STATUS.COMPLETED && !canRepeat ? questRepeatAtMs(row, quest) : null;
    const status = canRepeat || row.status === QUEST_STATUS.ABANDONED ? QUEST_STATUS.AVAILABLE : row.status;
    const isActive = isOpenStatus(status);
    // Een lopende quest toont de versie waarop deze speler hem speelt.
    const definition = isActive ? this.questDefinition(ctx, quest.id, row) : normalizeQuest(quest);
    const step = isActive ? stepById(definition, row.active_step_id) : null;
    // Past de lopende stap niet (meer) bij de versie van deze speler? Niet stilletjes terugzetten: zeggen wat er is.
    const broken = isActive && !step;
    if (broken) this.warnBrokenRun(ctx, quest, row, definition);
    const progress = step && step.kind !== "end" ? this.evaluateStepProgress(ctx, definition, step) : null;
    // Teamleden-ID's blijven op de server; de speler ziet alleen hoe groot het team is en zijn eigen bijdrage.
    const objectives = (progress?.objectives || []).filter(function (objective) { return !objective.hidden; }).map(function (objective) {
      if (!objective.team) return objective;
      return Object.assign({}, objective, { team: { size: objective.team.size, mine: objective.team.mine, perMember: objective.team.perMember, waiting: objective.team.waiting === true } });
    });
    const openNeeded = objectives.filter(function (objective) { return objective.needed && !objective.complete; });
    const inRange = (objective) => this.objectiveInRange(ctx, objective, 1.5, true);
    const rewardView = (reward) => {
      if (reward?.actionKind === "xp") return { kind: "xp", amount: safeInteger(reward.amount, 0) };
      if (reward?.actionKind === "currency") return { kind: "currency", currencyId: reward.currencyRef, displayName: displayForCurrency(ctx.catalogs, reward.currencyRef), amount: safeInteger(reward.amountMinor, 0) };
      if (reward?.actionKind === "item") return { kind: "item", itemId: reward.itemRef, displayName: displayForItem(ctx.catalogs, reward.itemRef), amount: safeInteger(reward.amount, 1) };
      return null;
    };
    // Stap 7: bij een einde met "Speler kiest 1": de beloningen om uit te kiezen (index = wat de knop terugstuurt).
    const rewardChoice = needsRewardPick(step) ? pickableRewards(step).map((reward, index) => Object.assign({ index }, rewardView(reward))) : null;
    return {
      questId: quest.id,
      displayName: definition?.displayName || quest.displayName || quest.id,
      summary: this.resolveTokenText(ctx, definition?.summary || quest.summary || ""),
      description: this.resolveTokenText(ctx, definition?.description || quest.description || ""),
      status,
      // Verlaten: weg uit het questboek, de NPC biedt hem wel weer aan.
      abandoned: row.status === QUEST_STATUS.ABANDONED,
      // Al eens ingeleverd: grijs in het questboek (met ↻ als hij nog een keer kan, anders in het Archief).
      doneBefore: row.status === QUEST_STATUS.COMPLETED,
      repeatMode: questRepeatMode(quest),
      canRepeat,
      repeatAt: repeatAt ? new Date(repeatAt).toISOString() : null,
      // Stap 6: mislukt (te laat): ↻ Opnieuw in het questboek.
      failed: row.status === QUEST_STATUS.FAILED,
      // Stap 4: een quest die vanzelf start kun je niet verlaten (geen knop Verlaten).
      canAbandon: !(quest.abandonable === false || quest.startMode === "auto"),
      // 5-11: het startvenster in de game (brief, gebied, vanzelf): hoe hij start, plaatje en welke quest je net af hebt.
      startMode: quest.startMode || "npc",
      imageAssetId: quest.imageAssetId || null,
      afterQuest: quest.startMode === "auto" ? this.afterQuestName(ctx, quest) : null,
      // "Nog een keer": loop naar de Quest giver en praat (alleen in deze zone).
      giverTargetId: canRepeat ? this.giverTargetId(ctx, quest) : null,
      tracked: row.tracked === 1,
      activeStepId: step?.id || null,
      activeStep: step ? {
        stepId: step.id,
        displayName: step.displayName || step.id,
        // Stap 3: zoekgebied / punt op de kaart, en de gebieden waar de game op let (in of uit = meteen opvragen).
        map: this.stepMapView(ctx, step),
        watchAreas: this.watchAreas(ctx, objectives),
        // Kevin 5-11: ⭐ op de kaart (ook door de mist) waar de vijand die je moet verslaan nu loopt.
        marks: this.liveMarks(ctx, step, objectives, quest.id),
        // Stap 6: de aftelklok van deze stap (null = geen klok, of nog niet gestart).
        timer: this.timerView(row, step),
        instruction: rewardChoice ? "Kies je beloning." : this.resolveTokenText(ctx, step.instruction || ""),
        rewardChoice,
        stepType: openNeeded[0]?.objectiveType || objectives[0]?.objectiveType || "custom",
        match: step.match === "any" ? "any" : "all",
        targetRef: openNeeded.find(function (objective) { return objective.targetRef; })?.targetRef || null,
        zoneRef: step.zoneRef || null,
        // "Klaar! Ga terug": alles gedaan, alleen nog inleveren bij de NPC.
        complete: Boolean(rewardChoice) || progress?.complete === true || (openNeeded.length > 0 && openNeeded.every(function (objective) { return objective.objectiveType === "deliver" && objective.ready; })),
        conditionsMet: progress?.conditionsMet !== false,
        blockedReason: progress?.blockedReason || "",
        canTurnIn: objectives.some((objective) => objective.objectiveType === "deliver" && objective.ready && inRange(objective)),
        canReach: objectives.some((objective) => objective.objectiveType === "talk" && !objective.complete && inRange(objective)),
        objectives,
        conditions: progress?.conditions || []
      } : broken ? {
        stepId: null, broken: true, displayName: "Quest is aangepast", stepType: "custom", match: "all", targetRef: null, zoneRef: null,
        instruction: "Deze quest is veranderd sinds je hem aannam. Verlaat hem en neem hem opnieuw aan.",
        complete: false, conditionsMet: true, blockedReason: "", canTurnIn: false, canReach: false, objectives: [], conditions: []
      } : null,
      nextQuestRefs: Array.isArray(quest.nextQuestRefs) ? quest.nextQuestRefs.slice() : [],
      // Stap 4 (HUD): de beloning in het questboek.
      rewards: (Array.isArray(quest.rewards) ? quest.rewards : []).map(rewardView).filter(function (reward) { return reward && reward.amount > 0; }),
      acceptedAt: row.accepted_at || null,
      completedAt: row.completed_at || null
    };
  }

  // 1 regel in het serverlog per speler en quest, zodat we kunnen zien waarom een run niet past.
  warnBrokenRun(ctx, quest, row, definition) {
    this.brokenWarned = this.brokenWarned || new Set();
    const key = ctx.profile.id + "|" + quest.id;
    if (this.brokenWarned.has(key)) return;
    this.brokenWarned.add(key);
    console.warn("[quest] stap past niet:", JSON.stringify({ playerId: ctx.profile.id, questId: quest.id, status: row.status, activeStepId: row.active_step_id,
      version: stateOf(row).version || null, currentVersion: normalizeQuest(quest)?.version || null, steps: (definition?.steps || []).map((step) => step.id) }));
  }

  buildRuntimeQuestTargets(ctx, trackedQuest, availableQuests) {
    const targets = [];
    if ([QUEST_STATUS.ACTIVE, QUEST_STATUS.READY_TO_TURN_IN].includes(trackedQuest?.status) && trackedQuest.activeStep) {
      const target = this.targetForActiveStep(ctx, trackedQuest);
      if (target) targets.push(target);
    }
    const offered = availableQuests.find((entry) => questById(ctx.project, entry.questId)?.startDialogueRef) || null;
    if (!targets.length && offered) {
      const quest = questById(ctx.project, offered.questId);
      const dialogue = quest?.startDialogueRef ? dialogueById(ctx.project, quest.startDialogueRef) : null;
      const target = this.resolveQuestTarget(ctx.project, dialogue?.targetRef || quest?.turnInTargetRef);
      if (target && target.zoneRef === ctx.zoneId) {
        targets.push(this.runtimeTargetFromQuestTarget(ctx, target, {
          instanceId: "node04:" + target.targetId + ":dialogue",
          action: "node04:start_dialogue",
          questId: quest.id,
          dialogueId: dialogue?.id || null,
          displayName: questTargetWorldName(target, quest.displayName),
          prompt: "Talk",
          status: "quest available"
        }));
      }
    }
    return targets;
  }

  stepMapView(ctx, step) {
    const area = step?.map ? questAreaById(ctx.project, step.map.areaRef) : null;
    if (!area) return null;
    const show = step.map.show === "point" || step.map.show === "hidden" ? step.map.show : "area";
    if (show === "hidden") return { show, areaId: area.id };
    return { show, areaId: area.id, name: area.displayName, center: area.center, radius: area.radius, points: show === "area" ? area.points : [] };
  }

  watchAreas(ctx, objectives) {
    const out = [];
    for (const objective of objectives || []) {
      if ((objective.objectiveType !== "enter" && objective.objectiveType !== "leave") || objective.complete) continue;
      const area = questAreaById(ctx.project, objective.areaRef);
      if (area && !out.some((entry) => entry.areaId === area.id)) out.push({ areaId: area.id, points: area.points });
    }
    return out;
  }

  // Stap 3: zonder NPC-doel wijst de quest naar het midden van het gebied (stap-kaart of Ga naar gebied); Verborgen = niets.
  targetForArea(ctx, trackedQuest) {
    const step = trackedQuest.activeStep;
    if (step?.map?.show === "hidden") return null;
    const enter = (step?.objectives || []).find((objective) => objective.objectiveType === "enter" && !objective.complete);
    const area = questAreaById(ctx.project, step?.map?.areaId || enter?.areaRef);
    if (!area) return null;
    return this.runtimeTargetFromQuestTarget(ctx, { targetId: "area." + area.id, x: area.center.x, y: 0, z: area.center.z, zoneRef: ctx.zoneId,
      radius: Math.max(3, area.radius), visibleInGame: false, displayName: area.displayName }, {
      instanceId: "node04:" + trackedQuest.questId + ":" + step.stepId + ":area",
      questId: trackedQuest.questId,
      displayName: area.displayName,
      prompt: "Ga hierheen",
      status: enter?.displayName || step.displayName || "quest gebied"
    });
  }

  targetForActiveStep(ctx, trackedQuest) {
    const step = trackedQuest.activeStep;
    if (!step) return null;
    const objectives = Array.isArray(step.objectives) ? step.objectives : [];
    const objectivesReady = objectives.every(function (objective) { return objective?.complete !== false; });
    const levelGate = objectivesReady && step.conditionsMet === false ? this.failedPlayerLevelCondition(step.conditions) : null;
    if (levelGate) {
      const levelTarget = this.targetForLevelGate(ctx, trackedQuest, step, levelGate);
      if (levelTarget) return levelTarget;
    }
    // Eerst een open doel dat nu kan (inleveren als je alles hebt), anders het eerste open doel met een plek.
    const open = objectives.filter(function (objective) { return !objective.complete && objective.targetRef; });
    const objective = open.find(function (candidate) { return candidate.needed !== false && (candidate.objectiveType !== "deliver" || candidate.ready); })
      || open.find(function (candidate) { return candidate.needed !== false; }) || open[0] || null;
    const target = this.resolveQuestTarget(ctx.project, objective?.targetRef || step.targetRef);
    if (target && target.zoneRef !== ctx.zoneId) {
      const linkTarget = this.travelTargetTowardZone(ctx, target.zoneRef);
      if (linkTarget) return linkTarget;
    }
    if (!target && step.zoneRef && step.zoneRef !== ctx.zoneId) {
      const linkTarget = this.travelTargetTowardZone(ctx, step.zoneRef);
      if (linkTarget) return linkTarget;
    }
    if (!target) return this.targetForArea(ctx, trackedQuest);
    if (target.zoneRef !== ctx.zoneId) return null;
    const talk = objective && (objective.objectiveType === "talk" || objective.objectiveType === "deliver");
    const dialogue = talk ? this.dialogueForTarget(ctx, target.targetId) : null;
    return this.runtimeTargetFromQuestTarget(ctx, target, {
      instanceId: "node04:" + trackedQuest.questId + ":" + step.stepId,
      action: dialogue ? "node04:start_dialogue" : "node04:move_marker",
      dialogueId: dialogue?.id || null,
      questId: trackedQuest.questId,
      displayName: questTargetWorldName(target, step.displayName || trackedQuest.displayName),
      prompt: dialogue ? "Praten" : "Ga hierheen",
      status: objective?.displayName || step.displayName || "quest target"
    });
  }

  failedPlayerLevelCondition(results) {
    for (const result of Array.isArray(results) ? results : []) {
      if (!result || typeof result !== "object") continue;
      if (result.conditionType === "player_level" && result.met === false) return result;
      const nested = this.failedPlayerLevelCondition(result.results);
      if (nested) return nested;
    }
    return null;
  }

  targetForLevelGate(ctx, trackedQuest, step, condition) {
    const entities = this.node03RuntimeService.loadEntities(ctx);
    const allEnemies = (Array.isArray(entities?.enemies) ? entities.enemies : []).filter(Boolean);
    if (!allEnemies.length) return null;
    const aliveEnemies = allEnemies.filter(function (enemy) {
      return enemy.alive !== false && enemy.status !== "dead";
    });
    const enemies = aliveEnemies.length ? aliveEnemies : allEnemies;
    const currentZoneId = safeString(ctx.zoneId, "");
    const nearest = function (list) {
      return list.slice().sort(function (left, right) {
        return safeNumber(left.distance, Number.MAX_SAFE_INTEGER) - safeNumber(right.distance, Number.MAX_SAFE_INTEGER);
      })[0] || null;
    };
    const enemy = nearest(enemies.filter(function (candidate) {
      return safeString(candidate.zoneId, currentZoneId) === currentZoneId;
    }));
    if (enemy) return this.runtimeTargetFromLevelEnemy(ctx, trackedQuest, step, condition, enemy);
    const otherZoneEnemy = nearest(enemies);
    if (otherZoneEnemy && safeString(otherZoneEnemy.zoneId, "") && safeString(otherZoneEnemy.zoneId, "") !== currentZoneId) {
      return this.travelTargetTowardZone(ctx, otherZoneEnemy.zoneId);
    }
    return null;
  }

  runtimeTargetFromLevelEnemy(ctx, trackedQuest, step, condition, enemy) {
    const distance = positionDistance(ctx.position, enemy);
    const required = Math.max(1, safeInteger(condition?.required, 1));
    const range = Math.max(1, safeNumber(enemy?.interaction?.range, 2.8));
    const radius = Math.max(0, safeNumber(enemy?.radius, 0.8));
    return {
      instanceId: "node04:" + trackedQuest.questId + ":" + step.stepId + ":level_enemy:" + safeString(enemy.instanceId, "enemy"),
      entityKind: "quest",
      targetKind: "quest",
      action: "node04:move_marker",
      questId: trackedQuest.questId,
      displayName: "Level " + required + " halen",
      prompt: "Zoek enemies",
      status: enemy.alive === false || enemy.status === "dead" ? "Wacht op enemy respawn" : "Versla enemies voor level " + required,
      available: true,
      distance: distance === null ? null : round(distance),
      range,
      radius,
      inRange: distance === null || distance <= range + radius,
      x: safeNumber(enemy.x, 0),
      y: safeNumber(enemy.y, 0),
      z: safeNumber(enemy.z, 0),
      targetId: enemy.instanceId,
      zoneRef: enemy.zoneId || ctx.zoneId
    };
  }

  travelTargetTowardZone(ctx, targetZoneId) {
    const routes = (Array.isArray(ctx.zonePackage?.links) ? ctx.zonePackage.links : []).map((link) => ({
      link,
      position: this.linkOriginPosition(ctx, link)
    })).filter(function (route) {
      return route.position.component && route.position.visualEntityId && route.position.modelAssetId;
    });
    const direct = routes.find(function (candidate) { return candidate.link.toZoneRef === targetZoneId; }) || null;
    const outward = routes.find(function (candidate) {
      return candidate.link.toZoneRef && candidate.link.toZoneRef !== ctx.zoneId;
    }) || null;
    const route = direct || outward || routes[0] || null;
    if (!route) return null;
    const link = route.link;
    const position = route.position;
    const targetZone = ctx.project?.zones?.byId?.[link.toZoneRef] || null;
    const distance = positionDistance(ctx.position, position);
    const range = Math.max(0.1, safeNumber(position.component.range, 4));
    const radius = Math.max(0, safeNumber(position.radius, 0));
    return {
      instanceId: link.linkId,
      entityKind: "quest",
      targetKind: "quest",
      action: "travel",
      questId: null,
      displayName: position.label || ("Travel: " + (targetZone?.zone?.displayName || link.toZoneRef)),
      prompt: link.prompt || "Travel",
      status: "quest route",
      available: true,
      distance: distance === null ? null : round(distance),
      range,
      radius,
      inRange: link.interactionRequired === false || distance === null || distance <= range + radius,
      visualEntityId: position.visualEntityId || null,
      renderBody: false,
      x: position.x,
      y: position.y,
      z: position.z
    };
  }

  linkOriginPosition(ctx, link) {
    return this.node03RuntimeService.linkOriginPosition(ctx, link);
  }

  runtimeTargetFromQuestTarget(ctx, target, extra) {
    const distance = positionDistance(ctx.position, target);
    const range = Math.max(1, safeNumber(target.radius, 3));
    const entityRef = safeString(target.entityRef, "");
    const hasLinkedEntity = Boolean(target.linkedEntity && typeof target.linkedEntity === "object");
    const linkedEntity = hasLinkedEntity ? target.linkedEntity : null;
    return Object.assign({
      instanceId: "node04:" + target.targetId,
      entityKind: "quest",
      targetKind: "quest",
      action: "node04:move_marker",
      displayName: questTargetWorldName(target, target.targetId),
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
      zoneRef: target.zoneRef || ctx.zoneId,
      entityRef: entityRef || null,
      linkedEntity,
      // Klikken op het model (bijv. een NPC) kiest dit doel.
      visualEntityId: safeString(linkedEntity?.entityId || entityRef, "") || null,
      // Klikvlak rond de NPC (los van de praat-afstand), zodat je ernaast gewoon kunt weglopen.
      clickRadius: Number.isFinite(Number(target.clickRadius)) ? Number(target.clickRadius) : null,
      renderBody: !linkedEntity,
      visibleInGame: target.visibleInGame !== false,
      renderMarker: target.visibleInGame !== false
    }, extra || {});
  }

  giverTargetId(ctx, quest) {
    const dialogue = quest?.startDialogueRef ? dialogueById(ctx.project, quest.startDialogueRef) : null;
    const target = this.resolveQuestTarget(ctx.project, dialogue?.targetRef || quest?.turnInTargetRef);
    return target && target.zoneRef === ctx.zoneId ? "node04:" + target.targetId + ":dialogue" : null;
  }

  buildQuestGivers(ctx, questSummaries) {
    const summaries = new Map(questSummaries.map(function (quest) { return [quest.questId, quest]; }));
    const givers = new Map();
    for (const quest of allQuests(ctx.project)) {
      const summary = summaries.get(quest.id);
      // Nog vergrendelde quests hebben geen spelerstate: hun gever krijgt pas een ster zodra
      // de quest werkelijk beschikbaar is geweest voor dit character.
      if (!summary) continue;
      const dialogue = quest?.startDialogueRef ? dialogueById(ctx.project, quest.startDialogueRef) : null;
      const target = this.resolveQuestTarget(ctx.project, dialogue?.targetRef || quest?.turnInTargetRef);
      if (!target || target.zoneRef !== ctx.zoneId) continue;
      const key = safeString(target.entityRef || target.linkedEntity?.entityId, target.targetId);
      let giver = givers.get(key);
      if (!giver) {
        giver = this.runtimeTargetFromQuestTarget(ctx, target, {
          instanceId: "node04:" + target.targetId + ":dialogue",
          action: "node04:start_dialogue",
          dialogueId: dialogue?.id || null,
          prompt: "Talk",
          status: "quest giver",
          hasAvailableQuest: false
        });
        givers.set(key, giver);
      }
      // Ook verlaten/herhaalbare quests tellen; een aangenomen quest wist de gever niet.
      if (summary.status === QUEST_STATUS.AVAILABLE && this.questPrerequisitesMet(ctx, quest) && !this.questStartIssue(ctx, quest)) {
        giver.hasAvailableQuest = true;
      }
    }
    return Array.from(givers.values());
  }

  buildDialogueTargets(ctx) {
    return Object.values(ctx.campaigns?.dialogues?.byId || {}).map((dialogue) => {
      const target = this.resolveQuestTarget(ctx.project, dialogue.targetRef);
      if (!target || target.zoneRef !== ctx.zoneId) return null;
      return this.runtimeTargetFromQuestTarget(ctx, target, {
        instanceId: "node04:" + target.targetId + ":dialogue",
        action: "node04:start_dialogue",
        dialogueId: dialogue.id,
        displayName: questTargetWorldName(target, dialogue.displayName || dialogue.id),
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
    if (row.reason === "manual_reset" || row.reason === "content_changed") return "Quest opnieuw beschikbaar: " + name;
    if (row.reason === "turn_in" || row.to_status === QUEST_STATUS.COMPLETED) return "Quest voltooid: " + name;
    if (row.reason === "step_complete") return "Volgende stap: " + name;
    if (row.to_status === QUEST_STATUS.ACTIVE) return "Quest actief: " + name;
    if (row.to_status === QUEST_STATUS.AVAILABLE) return "Quest beschikbaar: " + name;
    return name;
  }

  resetQuest(ctx, questId, operationId) {
    const quest = questById(ctx.project, questId);
    if (!quest) {
      const error = new Error("Quest niet gevonden.");
      error.status = 404;
      throw error;
    }
    this.resetQuestState(ctx, quest, operationId, "manual_reset", { forceAvailable: true });
    return {
      message: "Quest opnieuw beschikbaar: " + (quest.displayName || quest.id),
      events: [{ type: "quest_reset", questId: quest.id }]
    };
  }

  resetQuestState(ctx, quest, operationId, reason, options = {}) {
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_dialogue_choices WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    if (options.forceAvailable !== true && !this.questPrerequisitesMet(ctx, quest)) {
      this.db.prepare("DELETE FROM player_quest_states WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
      return;
    }
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, completed_at, claimed_at, revision, state_json, updated_at)
      VALUES (?, ?, 'available', NULL, ?, NULL, NULL, NULL, 1, ?, ?)
      ON CONFLICT(player_id, quest_id) DO UPDATE SET
        status = 'available',
        active_step_id = NULL,
        tracked = excluded.tracked,
        accepted_at = NULL,
        completed_at = NULL,
        claimed_at = NULL,
        revision = player_quest_states.revision + 1,
        state_json = excluded.state_json,
        updated_at = excluded.updated_at
    `).run(ctx.profile.id, quest.id, quest.autoTrack === true ? 1 : 0, this.questStateJson(ctx, quest), stamp);
    this.audit(ctx, quest.id, row?.status || null, QUEST_STATUS.AVAILABLE, row?.active_step_id || null, null, operationId || null, reason, {
      contentHash: quest.contentHash || null
    });
  }

  resetNode04(ctx) {
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_quest_states WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM player_dialogue_choices WHERE player_id = ?").run(ctx.profile.id);
    this.db.prepare("DELETE FROM quest_transition_audit WHERE player_id = ?").run(ctx.profile.id);
    this.ensureAvailableQuests(ctx);
    return { message: "Questgegevens opnieuw ingesteld.", events: [{ type: "node04_reset" }] };
  }

  // ---------- Quest Builder (5-11): spelers per quest, alleen voor de admin (editor, tab 🧪 Testen) ----------

  // Per character: nog niet / bezig (welke stap) / gedaan / verlaten / mislukt. Zo zie je of spelers ergens vastlopen.
  questPlayersForAdmin(questId) {
    const id = safeString(questId, "");
    if (!id) throw httpError(400, "Geen quest gekozen.");
    return this.db.prepare(`
      SELECT p.id AS player_id, p.selected_character_id AS class_id, u.id AS user_id, u.username, u.role,
        s.status, s.active_step_id, s.accepted_at, s.completed_at, s.updated_at
      FROM player_profiles p JOIN users u ON u.id = p.user_id
      LEFT JOIN player_quest_states s ON s.player_id = p.id AND s.quest_id = ?
      ORDER BY u.username COLLATE NOCASE, p.created_at
    `).all(id).map((row) => ({
      playerId: row.player_id,
      userId: row.user_id,
      username: row.username,
      role: row.role,
      classId: row.class_id || null,
      status: row.status || "none",
      stepId: isOpenStatus(row.status) ? row.active_step_id || null : null,
      since: (isOpenStatus(row.status) ? row.accepted_at : row.status === QUEST_STATUS.COMPLETED ? row.completed_at : null) || row.updated_at || null
    }));
  }

  // Opnieuw = alsof die speler de quest nooit had (ook de questitems en Ieder 1×-pickups ervan); Naar stap = test of hulp bij vastlopen.
  adminQuestAction(payload = {}) {
    const action = safeString(payload.action, "");
    const ctx = this.node03RuntimeService.adminContextForPlayer(payload.playerId);
    ctx.campaigns = campaignPackage(ctx.project);
    const questId = safeString(payload.questId, "");
    const operationId = randomId("admin_quest");
    const result = this.atomic(() => {
      if (action === "reset") return this.adminResetQuest(ctx, questId, operationId);
      if (action === "step") return this.devSetStep(ctx, questId, safeString(payload.stepId, ""), operationId);
      if (action === "timer") return this.adminTimerAlmostUp(ctx, questId);
      throw httpError(400, "Onbekende actie.");
    });
    this.pingQuest([ctx.profile.id]);
    return result;
  }

  // Stap 6 (Testen): de lopende klok staat nog 5 seconden (bij een groepsklok voor de hele groep op die stap).
  adminTimerAlmostUp(ctx, questId) {
    const row = this.loadQuestState(ctx.profile.id, questId);
    const quest = row ? this.questDefinition(ctx, questId, row) : null;
    const step = quest ? stepById(quest, row.active_step_id) : null;
    const timer = stateOf(row).timer;
    if (!row || !isOpenStatus(row.status) || !step?.timer || timer?.stepId !== step.id || !timer.endsAt || timer.stopped) throw httpError(400, "Er loopt nu geen klok bij deze speler.");
    const endsAt = this.clock() + 5000;
    const ids = step.timer.share === "group" ? this.teamMembers(ctx.profile.id, quest.id, quest.version, step.id).ids : [ctx.profile.id];
    for (const id of ids) {
      const other = stateOf(this.loadQuestState(id, quest.id)).timer;
      if (other?.stepId === step.id && other.endsAt && !other.stopped) this.writeTimer(id, quest.id, Object.assign({}, other, { endsAt, pausedAt: undefined }));
    }
    this.pingQuest(ids);
    return { message: "⏱️ De klok staat nog 5 seconden." };
  }

  adminResetQuest(ctx, questId, operationId) {
    const quest = normalizeQuest(questById(ctx.project, questId));
    if (!quest) throw httpError(404, "Quest niet gevonden. Druk eerst SAVE TO GAME.");
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    const items = this.questItemIds(ctx, quest);
    this.removeQuestItems(ctx, quest, false, operationId);
    // Pickups (Ieder eigen / Ieder 1×) die een questitem van deze quest gaven, mag deze speler weer pakken.
    for (const claim of this.db.prepare("SELECT instance_id FROM player_pickup_claims WHERE player_id = ?").all(ctx.profile.id)) {
      const entity = this.db.prepare("SELECT state_json FROM world_entity_state WHERE instance_id = ? LIMIT 1").get(claim.instance_id);
      const itemRef = safeJsonParse(entity?.state_json || "{}", {})?.itemRef;
      if (itemRef && items.has(itemRef)) this.db.prepare("DELETE FROM player_pickup_claims WHERE player_id = ? AND instance_id = ?").run(ctx.profile.id, claim.instance_id);
    }
    for (const table of ["player_objective_progress", "player_quest_event_receipts", "player_dialogue_choices", "player_quest_states"]) {
      this.db.prepare("DELETE FROM " + table + " WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    }
    this.audit(ctx, quest.id, row?.status || null, QUEST_STATUS.AVAILABLE, row?.active_step_id || null, null, operationId, "admin_reset", {});
    return { message: (quest.displayName || quest.id) + " is weg bij deze speler (alsof hij hem nooit had)." };
  }

  // Alleen voor ontwikkelaars (Testen in de Quest Builder): een nieuwe run die direct bij deze stap begint.
  devSetStep(ctx, questId, stepId, operationId) {
    const quest = normalizeQuest(questById(ctx.project, questId));
    const step = stepById(quest, stepId);
    if (!quest) throw httpError(404, "Quest niet gevonden.");
    if (!step || step.kind === "end") throw httpError(400, "Kies een stap (geen einde).");
    const row = this.loadQuestState(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_objective_progress WHERE player_id = ? AND quest_id = ?").run(ctx.profile.id, quest.id);
    this.db.prepare("DELETE FROM player_quest_event_receipts WHERE player_id = ? AND quest_id = ? AND (event_id LIKE 'ev:%' OR event_id LIKE 'rule:%')").run(ctx.profile.id, quest.id);
    this.rememberQuestVersion(quest);
    const stamp = now();
    this.db.prepare(`
      INSERT INTO player_quest_states (player_id, quest_id, status, active_step_id, tracked, accepted_at, revision, state_json, updated_at)
      VALUES (?, ?, 'active', ?, 1, ?, 1, ?, ?)
      ON CONFLICT(player_id, quest_id) DO UPDATE SET status = 'active', active_step_id = excluded.active_step_id, tracked = 1,
        accepted_at = excluded.accepted_at, completed_at = NULL, claimed_at = NULL, revision = player_quest_states.revision + 1,
        state_json = excluded.state_json, updated_at = excluded.updated_at
    `).run(ctx.profile.id, quest.id, step.id, stamp, this.questStateJson(ctx, quest, { version: quest.version, runId: randomId("run") }), stamp);
    this.audit(ctx, quest.id, row?.status || null, QUEST_STATUS.ACTIVE, row?.active_step_id || null, step.id, operationId, "dev_set_step", {});
    return { message: "Test: " + (quest.displayName || quest.id) + " staat op stap '" + (step.displayName || step.id) + "'.", events: [] };
  }
}
