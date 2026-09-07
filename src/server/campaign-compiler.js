import crypto from "node:crypto";
import { QUEST_SCHEMA_VERSION } from "../shared/quest-contract.js";
import {
  canonicalJsonStringify,
  deepCloneJson,
  normalizeCanonicalId,
  normalizeReferenceList,
  normalizeTagList
} from "../shared/node-contract.js";

function safeString(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeInteger(value, fallback = 0) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? number : fallback;
}

function clone(value) {
  return deepCloneJson(value);
}

function contentHashFor(value) {
  return "sha256:" + crypto.createHash("sha256").update(canonicalJsonStringify(value)).digest("hex");
}

function refreshContentHash(record) {
  if (!record) return record;
  record.contentHash = contentHashFor(Object.assign({}, record, {
    nodeId: undefined,
    nodeType: undefined,
    contentHash: undefined
  }));
  return record;
}

function nodeMapForGraph(graph) {
  return new Map((Array.isArray(graph?.nodes) ? graph.nodes : []).map(function (node) {
    return [node.id, node];
  }));
}

function directIncomingEdges(graph, outputNode, portName) {
  return (Array.isArray(graph?.edges) ? graph.edges : []).filter(function (edge) {
    return edge.toNodeId === outputNode.id && edge.toPort === portName;
  });
}

function firstNodeOfType(graph, parentId, type) {
  return (Array.isArray(graph?.nodes) ? graph.nodes : []).find(function (node) {
    return node.parentId === parentId && node.type === type;
  }) || null;
}

function uniqueNodes(nodes) {
  const map = new Map();
  for (const node of nodes || []) {
    if (node?.id) map.set(node.id, node);
  }
  return Array.from(map.values());
}

function createResolutionState() {
  return { stack: [], keyIndex: new Map() };
}

function resolutionKey(kind, node, portName) {
  return kind + ":" + node.id + ":" + portName + ":" + (node.parentId || "root");
}

function enterResolution(state, kind, node, portName) {
  const key = resolutionKey(kind, node, portName);
  if (state.keyIndex.has(key)) {
    const error = new Error("Group connection cycle detected while compiling campaign content.");
    error.status = 400;
    throw error;
  }
  const frame = { key, nodeId: node.id, portName };
  state.keyIndex.set(key, state.stack.length);
  state.stack.push(frame);
  return frame;
}

function leaveResolution(state, frame) {
  const index = state.stack.lastIndexOf(frame);
  if (index !== -1) state.stack.splice(index, 1);
  state.keyIndex.delete(frame.key);
}

function resolveInputSources(graph, targetNode, portName, nodeMap, state = createResolutionState()) {
  const frame = enterResolution(state, "input", targetNode, portName);
  try {
    const resolved = [];
    for (const edge of directIncomingEdges(graph, targetNode, portName)) {
      const source = nodeMap.get(edge.fromNodeId);
      if (!source) continue;
      resolved.push.apply(resolved, resolveOutputSources(graph, source, edge.fromPort, nodeMap, state));
    }
    return uniqueNodes(resolved);
  } finally {
    leaveResolution(state, frame);
  }
}

function resolveOutputSources(graph, sourceNode, portName, nodeMap, state = createResolutionState()) {
  const frame = enterResolution(state, "output", sourceNode, portName);
  try {
    if (sourceNode.type === "group") {
      const outputNode = firstNodeOfType(graph, sourceNode.id, "group_output");
      if (!outputNode) return [];
      return resolveInputSources(graph, outputNode, portName, nodeMap, state);
    }
    if (sourceNode.type === "group_input") {
      const parent = nodeMap.get(sourceNode.parentId);
      if (!parent) return [];
      return resolveInputSources(graph, parent, portName, nodeMap, state);
    }
    if (sourceNode.type === "group_output") return [];
    return [sourceNode];
  } finally {
    leaveResolution(state, frame);
  }
}

function incomingNodes(graph, node, portName, nodeMap) {
  if (!node) return [];
  return resolveInputSources(graph, node, portName, nodeMap);
}

function firstIncomingNode(graph, node, portName, nodeMap) {
  return incomingNodes(graph, node, portName, nodeMap)[0] || null;
}

function values(node) {
  return clone(node?.values || {});
}

function baseRecord(node, idField) {
  const raw = values(node);
  const id = normalizeCanonicalId(raw[idField], "");
  if (!id) return null;
  const record = Object.assign({}, raw, {
    id,
    nodeId: node.id,
    nodeType: node.type,
    displayName: safeString(raw.displayName || raw.label || raw[idField] || id),
    tags: normalizeTagList(raw.tags)
  });
  return refreshContentHash(record);
}

function typeFromObjectiveNode(type) {
  if (type === "objective_talk") return "talk";
  if (type === "objective_collect") return "collect";
  if (type === "objective_deliver") return "deliver";
  if (type === "objective_reach") return "reach";
  return "custom";
}

function buildObjective(node) {
  const record = baseRecord(node, "objectiveId");
  if (!record) return null;
  record.objectiveType = typeFromObjectiveNode(node.type);
  record.requiredAmount = Math.max(1, safeInteger(record.requiredAmount || record.requiredCount, 1));
  record.requiredCount = record.requiredAmount;
  record.radius = Math.max(0.1, safeNumber(record.radius, 4));
  return record;
}

function buildCondition(graph, node, nodeMap) {
  const record = baseRecord(node, "conditionId");
  if (!record) return null;
  if (node.type === "condition_player_level") {
    record.conditionType = "player_level";
    record.level = Math.max(1, safeInteger(record.level, 1));
  } else if (node.type === "condition_has_item") {
    record.conditionType = "has_item";
    record.amount = Math.max(1, safeInteger(record.amount, 1));
  } else if (node.type === "condition_group") {
    record.conditionType = "group";
    record.mode = record.mode === "any" ? "any" : "all";
    record.conditions = incomingNodes(graph, node, "conditions", nodeMap).map(function (child) {
      return buildCondition(graph, child, nodeMap);
    }).filter(Boolean);
  } else {
    record.conditionType = "custom";
  }
  return record;
}

function actionKindForNode(type) {
  if (type === "action_give_currency") return "currency";
  if (type === "action_give_xp") return "xp";
  if (type === "action_unlock_ability") return "ability";
  if (type === "action_remove_item") return "remove_item";
  if (type === "action_start_quest") return "start_quest";
  if (type === "action_sequence") return "sequence";
  if (type === "reward_bundle") return "bundle";
  return "custom";
}

function buildAction(graph, node, nodeMap) {
  const idField = node.type === "reward_bundle" ? "rewardBundleId" : "actionId";
  const record = baseRecord(node, idField);
  if (!record) return null;
  record.actionKind = actionKindForNode(node.type);
  if (node.type === "action_give_currency") {
    record.amountMinor = Math.max(0, safeInteger(record.amountMinor, 0));
  } else if (node.type === "action_give_xp") {
    record.amount = Math.max(0, safeInteger(record.amount, 0));
  } else if (node.type === "action_unlock_ability") {
    record.rank = Math.max(1, safeInteger(record.rank, 1));
    record.preferredSlotIndex = Math.max(0, safeInteger(record.preferredSlotIndex, 2));
  } else if (node.type === "action_remove_item") {
    record.amount = Math.max(1, safeInteger(record.amount, 1));
  } else if (node.type === "action_sequence") {
    record.actions = incomingNodes(graph, node, "actions", nodeMap).map(function (child) {
      return buildAction(graph, child, nodeMap);
    }).filter(Boolean);
  } else if (node.type === "reward_bundle") {
    record.rewards = incomingNodes(graph, node, "rewards", nodeMap).map(function (child) {
      return buildAction(graph, child, nodeMap);
    }).filter(Boolean);
  }
  return record;
}

function buildMarkerRule(node) {
  const record = baseRecord(node, "markerRuleId");
  if (!record) return null;
  record.radius = Math.max(0.1, safeNumber(record.radius, 4));
  return record;
}

function buildQuestStep(graph, node, nodeMap) {
  const record = baseRecord(node, "stepId");
  if (!record) return null;
  record.sequenceIndex = safeInteger(record.sequenceIndex, 1);
  record.stepType = safeString(record.stepType || "custom", "custom");
  record.objectives = incomingNodes(graph, node, "objectives", nodeMap).map(buildObjective).filter(Boolean);
  record.conditions = incomingNodes(graph, node, "conditions", nodeMap).map(function (conditionNode) {
    return buildCondition(graph, conditionNode, nodeMap);
  }).filter(Boolean);
  record.rewards = incomingNodes(graph, node, "rewards", nodeMap).map(function (actionNode) {
    return buildAction(graph, actionNode, nodeMap);
  }).filter(Boolean);
  record.markerRule = buildMarkerRule(firstIncomingNode(graph, node, "markerRule", nodeMap));
  record.autoAdvance = record.autoAdvance !== false;
  return record;
}

function buildQuest(graph, node, nodeMap) {
  const record = baseRecord(node, "questId");
  if (!record) return null;
  const steps = incomingNodes(graph, node, "steps", nodeMap).map(function (stepNode) {
    return buildQuestStep(graph, stepNode, nodeMap);
  }).filter(Boolean).sort(function (left, right) {
    if (left.sequenceIndex !== right.sequenceIndex) return left.sequenceIndex - right.sequenceIndex;
    return String(left.id).localeCompare(String(right.id));
  });
  const unlockRefs = incomingNodes(graph, node, "unlocks", nodeMap).map(function (questNode) {
    return normalizeCanonicalId(questNode?.values?.questId, "");
  }).filter(Boolean);
  const dialogueNode = firstIncomingNode(graph, node, "startDialogue", nodeMap);
  const dialogue = dialogueNode ? buildDialogue(graph, dialogueNode, nodeMap) : null;
  record.steps = steps;
  record.stepsById = Object.fromEntries(steps.map(function (step) { return [step.id, step]; }));
  record.startStepRef = normalizeCanonicalId(record.startStepRef, "") || steps[0]?.id || null;
  record.rewards = incomingNodes(graph, node, "rewards", nodeMap).map(function (actionNode) {
    return buildAction(graph, actionNode, nodeMap);
  }).filter(Boolean);
  record.conditions = incomingNodes(graph, node, "conditions", nodeMap).map(function (conditionNode) {
    return buildCondition(graph, conditionNode, nodeMap);
  }).filter(Boolean);
  record.startDialogueRef = normalizeCanonicalId(dialogueNode?.values?.dialogueId, "") || record.startDialogueRef || null;
  record.startDialogueContentHash = dialogue?.contentHash || null;
  record.prerequisiteQuestRefs = normalizeReferenceList(record.prerequisiteQuestRefs);
  record.nextQuestRefs = Array.from(new Set(normalizeReferenceList(record.nextQuestRefs).concat(unlockRefs)));
  record.autoTrack = record.autoTrack !== false;
  return refreshContentHash(record);
}

function buildChapter(graph, node, nodeMap) {
  const record = baseRecord(node, "chapterId");
  if (!record) return null;
  const questNodes = incomingNodes(graph, node, "quests", nodeMap).filter(function (questNode) {
    return questNode.type === "quest_definition";
  });
  record.quests = questNodes.map(function (questNode) {
    return normalizeCanonicalId(questNode?.values?.questId, "");
  }).filter(Boolean);
  record.order = safeInteger(record.order, 1);
  return record;
}

function buildCampaign(graph, node, nodeMap) {
  const record = baseRecord(node, "campaignId");
  if (!record) return null;
  const chapterNodes = incomingNodes(graph, node, "chapters", nodeMap).filter(function (chapterNode) {
    return chapterNode.type === "chapter_definition";
  });
  record.chapters = chapterNodes.map(function (chapterNode) {
    return normalizeCanonicalId(chapterNode?.values?.chapterId, "");
  }).filter(Boolean);
  record.priority = safeInteger(record.priority, 0);
  return record;
}

function buildDialogueChoice(graph, node, nodeMap) {
  const record = baseRecord(node, "choiceId");
  if (!record) return null;
  record.order = safeInteger(record.order, 1);
  record.conditions = incomingNodes(graph, node, "conditions", nodeMap).map(function (conditionNode) {
    return buildCondition(graph, conditionNode, nodeMap);
  }).filter(Boolean);
  return record;
}

function buildDialogueEntry(graph, node, nodeMap) {
  if (node.type === "dialogue_terminal") {
    const terminal = baseRecord(node, "terminalId");
    if (!terminal) return null;
    terminal.entryType = "terminal";
    terminal.entryId = terminal.id;
    terminal.choices = [];
    terminal.closeAfterLine = true;
    return terminal;
  }
  const record = baseRecord(node, "entryId");
  if (!record) return null;
  record.entryType = "line";
  record.choices = incomingNodes(graph, node, "choices", nodeMap).map(function (choiceNode) {
    return buildDialogueChoice(graph, choiceNode, nodeMap);
  }).filter(Boolean).sort(function (left, right) {
    if (left.order !== right.order) return left.order - right.order;
    return String(left.id).localeCompare(String(right.id));
  });
  return record;
}

function buildDialogue(graph, node, nodeMap) {
  const record = baseRecord(node, "dialogueId");
  if (!record) return null;
  const entries = incomingNodes(graph, node, "entries", nodeMap).map(function (entryNode) {
    return buildDialogueEntry(graph, entryNode, nodeMap);
  }).filter(Boolean);
  record.entries = entries;
  record.entriesById = Object.fromEntries(entries.map(function (entry) { return [entry.id, entry]; }));
  record.startEntryRef = normalizeCanonicalId(record.startEntryRef, "") || entries[0]?.id || null;
  return refreshContentHash(record);
}

function campaignOutputNodesForRegistry(graph, registryNode, nodeMap) {
  if (!registryNode) {
    return (Array.isArray(graph?.nodes) ? graph.nodes : []).filter(function (node) {
      return node.type === "campaign_output";
    });
  }
  const outputs = [];
  for (const edge of directIncomingEdges(graph, registryNode, "campaignPackage")) {
    const source = nodeMap.get(edge.fromNodeId);
    if (!source) continue;
    outputs.push.apply(outputs, resolveOutputSources(graph, source, edge.fromPort, nodeMap));
  }
  return uniqueNodes(outputs).filter(function (node) { return node.type === "campaign_output"; });
}

function nestedChapterNodes(graph, campaignNodes, nodeMap) {
  const chapters = [];
  for (const campaignNode of campaignNodes) {
    chapters.push.apply(chapters, incomingNodes(graph, campaignNode, "chapters", nodeMap));
  }
  return uniqueNodes(chapters).filter(function (node) { return node.type === "chapter_definition"; });
}

function nestedQuestNodes(graph, chapterNodes, questNodes, nodeMap) {
  const result = questNodes.slice();
  for (const chapterNode of chapterNodes) {
    result.push.apply(result, incomingNodes(graph, chapterNode, "quests", nodeMap));
  }
  return uniqueNodes(result).filter(function (node) { return node.type === "quest_definition"; });
}

function nestedMarkerRuleNodes(graph, questNodes, nodeMap) {
  const markerNodes = [];
  for (const questNode of questNodes) {
    const stepNodes = incomingNodes(graph, questNode, "steps", nodeMap);
    for (const stepNode of stepNodes) {
      const marker = firstIncomingNode(graph, stepNode, "markerRule", nodeMap);
      if (marker) markerNodes.push(marker);
    }
  }
  return uniqueNodes(markerNodes).filter(function (node) { return node.type === "quest_marker_rule"; });
}

function nestedRewardNodes(graph, questNodes, nodeMap) {
  const rewards = [];
  for (const questNode of questNodes) {
    rewards.push.apply(rewards, incomingNodes(graph, questNode, "rewards", nodeMap));
    const stepNodes = incomingNodes(graph, questNode, "steps", nodeMap);
    for (const stepNode of stepNodes) rewards.push.apply(rewards, incomingNodes(graph, stepNode, "rewards", nodeMap));
  }
  return uniqueNodes(rewards);
}

function addRecord(map, record, errors, label) {
  if (!record?.id) return;
  const existing = map.get(record.id);
  if (existing && existing.nodeId !== record.nodeId) {
    errors.push({
      code: "CAMPAIGN_DUPLICATE_ID",
      severity: "error",
      message: "Dubbele " + label + " id: " + record.id + ".",
      nodeId: record.nodeId,
      referenceId: record.id
    });
    return;
  }
  map.set(record.id, record);
}

function sortedMapObject(map) {
  const output = {};
  for (const key of Array.from(map.keys()).sort()) output[key] = map.get(key);
  return output;
}

function collection(map) {
  return {
    byId: sortedMapObject(map),
    all: Array.from(map.keys()).sort()
  };
}

export function compileCampaignRegistry(graph, campaignRegistryNode, options = {}) {
  const nodeMap = options.nodeMap || nodeMapForGraph(graph);
  const errors = [];
  const warnings = [];
  const packages = [];
  const campaigns = new Map();
  const chapters = new Map();
  const quests = new Map();
  const dialogues = new Map();
  const markerRules = new Map();
  const rewards = new Map();

  const outputNodes = campaignOutputNodesForRegistry(graph, campaignRegistryNode, nodeMap);
  for (const outputNode of outputNodes) {
    const campaignNodes = incomingNodes(graph, outputNode, "campaigns", nodeMap).filter(function (node) { return node.type === "campaign_definition"; });
    const chapterNodes = nestedChapterNodes(graph, campaignNodes, nodeMap);
    const directQuestNodes = incomingNodes(graph, outputNode, "quests", nodeMap).filter(function (node) { return node.type === "quest_definition"; });
    const questNodes = nestedQuestNodes(graph, chapterNodes, directQuestNodes, nodeMap);
    const dialogueNodes = incomingNodes(graph, outputNode, "dialogues", nodeMap).filter(function (node) { return node.type === "dialogue_definition"; });
    const markerNodes = uniqueNodes(incomingNodes(graph, outputNode, "markerRules", nodeMap).concat(nestedMarkerRuleNodes(graph, questNodes, nodeMap)));
    const rewardNodes = uniqueNodes(incomingNodes(graph, outputNode, "rewards", nodeMap).concat(nestedRewardNodes(graph, questNodes, nodeMap)));

    for (const node of campaignNodes) addRecord(campaigns, buildCampaign(graph, node, nodeMap), errors, "campaign");
    for (const node of chapterNodes) addRecord(chapters, buildChapter(graph, node, nodeMap), errors, "chapter");
    for (const node of questNodes) addRecord(quests, buildQuest(graph, node, nodeMap), errors, "quest");
    for (const node of dialogueNodes) addRecord(dialogues, buildDialogue(graph, node, nodeMap), errors, "dialogue");
    for (const node of markerNodes) addRecord(markerRules, buildMarkerRule(node), errors, "marker rule");
    for (const node of rewardNodes) addRecord(rewards, buildAction(graph, node, nodeMap), errors, "reward");

    packages.push({
      id: normalizeCanonicalId(outputNode.values?.packageId, "") || outputNode.id,
      packageVersion: safeString(outputNode.values?.packageVersion || "0.4.0"),
      namespaceOwnership: Array.isArray(outputNode.values?.namespaceOwnership) ? outputNode.values.namespaceOwnership.slice() : [],
      campaigns: campaignNodes.map(function (node) { return normalizeCanonicalId(node?.values?.campaignId, ""); }).filter(Boolean),
      quests: questNodes.map(function (node) { return normalizeCanonicalId(node?.values?.questId, ""); }).filter(Boolean),
      dialogues: dialogueNodes.map(function (node) { return normalizeCanonicalId(node?.values?.dialogueId, ""); }).filter(Boolean)
    });
  }

  const payload = {
    schemaVersion: QUEST_SCHEMA_VERSION,
    registryId: normalizeCanonicalId(campaignRegistryNode?.values?.registryId, "") || "campaign_registry.main",
    packages: packages.sort(function (left, right) { return left.id.localeCompare(right.id); }),
    packageCount: packages.length,
    campaigns: collection(campaigns),
    chapters: collection(chapters),
    quests: collection(quests),
    dialogues: collection(dialogues),
    markerRules: collection(markerRules),
    rewards: collection(rewards),
    questCount: quests.size,
    dialogueCount: dialogues.size,
    errors,
    warnings
  };
  payload.contentHash = contentHashFor(Object.assign({}, payload, { errors: [], warnings: [], contentHash: undefined }));
  return payload;
}

export function compileCampaignsFromGraph(graph, options = {}) {
  const nodeMap = options.nodeMap || nodeMapForGraph(graph);
  const registryNode = options.registryNode
    || (Array.isArray(graph?.nodes) ? graph.nodes.find(function (node) { return node.type === "campaign_registry"; }) : null);
  return compileCampaignRegistry(graph, registryNode, Object.assign({}, options, { nodeMap }));
}
