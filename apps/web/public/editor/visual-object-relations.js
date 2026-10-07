import { normalizeCanonicalId, normalizeReferenceList } from "../shared/node-contract.js";

// These helpers read and return ordinary persistent graphs. They own no UI state
// and never infer an asset, another entity, or a replacement relationship.
const DEFINITION_TYPES = new Set(["quest_definition", "dialogue_definition"]);
const OWNER_INPUTS = {
  quest_step: new Set(["objectives", "conditions", "rewards", "markerRule"]),
  quest_definition: new Set(["steps", "conditions", "rewards", "startDialogue"]),
  dialogue_entry: new Set(["choices"]),
  dialogue_definition: new Set(["entries"]),
  dialogue_router: new Set(["entries", "conditions"])
};

function canonical(value) {
  return normalizeCanonicalId(value, "");
}

function identities(node, nodeTypes) {
  return Object.entries(nodeTypes?.[node.type]?.fields || {})
    .filter(function ([key, field]) { return field.type === "identity" && /Id$/.test(key); })
    .map(function ([key]) { return canonical(node.values?.[key]); }).filter(Boolean);
}

function references(node, nodeTypes) {
  return Object.entries(nodeTypes?.[node.type]?.fields || {}).flatMap(function ([key, field]) {
    if (field.type === "reference") return [canonical(node.values?.[key])].filter(Boolean);
    if (field.type === "referenceList") return normalizeReferenceList(node.values?.[key]);
    return [];
  });
}

function indexGraph(graph) {
  const nodes = new Map((graph.nodes || []).map(function (node) { return [node.id, node]; }));
  const outgoing = new Map();
  const incoming = new Map();
  for (const edge of graph.edges || []) {
    if (!outgoing.has(edge.fromNodeId)) outgoing.set(edge.fromNodeId, []);
    if (!incoming.has(edge.toNodeId)) incoming.set(edge.toNodeId, []);
    outgoing.get(edge.fromNodeId).push(edge);
    incoming.get(edge.toNodeId).push(edge);
  }
  return { nodes, outgoing, incoming };
}

function localObjectNodes(graph, nodeTypes, modelId, index) {
  const model = index.nodes.get(modelId);
  if (model?.type !== "model_entity") return new Set();
  const ids = new Set([modelId]);
  for (const edge of index.outgoing.get(modelId) || []) {
    if (edge.fromPort === "entity" && edge.toPort === "model"
      && index.nodes.get(edge.toNodeId)?.type === "entity_assembly") ids.add(edge.toNodeId);
  }
  for (const id of Array.from(ids)) {
    if (index.nodes.get(id)?.type !== "entity_assembly") continue;
    for (const edge of index.incoming.get(id) || []) {
      if (edge.fromPort === "component" && edge.toPort === "components") ids.add(edge.fromNodeId);
    }
  }
  const ownerRefs = new Set(Array.from(ids).flatMap(function (id) {
    const node = index.nodes.get(id);
    return node && ["model_entity", "entity_assembly"].includes(node.type) ? identities(node, nodeTypes) : [];
  }));
  for (const node of graph.nodes || []) {
    if (node.type !== "quest_target_binding") continue;
    const linked = (index.incoming.get(node.id) || []).some(function (edge) {
      return edge.toPort === "entity" && edge.fromPort === "entity" && ids.has(edge.fromNodeId);
    });
    if (linked || ownerRefs.has(canonical(node.values?.entityRef))) ids.add(node.id);
  }
  return ids;
}

function humanSort(nodes) {
  return nodes.sort(function (a, b) {
    const title = function (node) { return String(node.values?.displayName || node.values?.label || node.values?.instruction || node.type); };
    return title(a).localeCompare(title(b), "nl", { sensitivity: "base" });
  });
}

/** Resolve an object's quest/dialogue definitions, including owners of target
 * objectives and quest steps. Returned nodes are the original graph nodes;
 * localNodeIds and relationNodeIds are Sets for focus/filter/navigation. */
export function visualObjectRelations(graph, nodeTypes, modelId) {
  const index = indexGraph(graph);
  const localNodeIds = localObjectNodes(graph, nodeTypes, modelId, index);
  const refs = new Set(Array.from(localNodeIds).flatMap(function (id) {
    const node = index.nodes.get(id);
    return node ? identities(node, nodeTypes) : [];
  }));
  const relationNodeIds = new Set();
  const queue = [];
  const add = function (node) {
    if (!node || localNodeIds.has(node.id) || relationNodeIds.has(node.id)) return;
    relationNodeIds.add(node.id);
    queue.push(node);
  };
  for (const node of graph.nodes || []) {
    if (references(node, nodeTypes).some(function (ref) { return refs.has(ref); })) add(node);
  }
  // Components may also point outward to a dialogue/quest definition.
  const outwardRefs = new Set(Array.from(localNodeIds).flatMap(function (id) {
    const node = index.nodes.get(id);
    return node ? references(node, nodeTypes) : [];
  }));
  for (const node of graph.nodes || []) {
    if (DEFINITION_TYPES.has(node.type) && identities(node, nodeTypes).some(function (ref) { return outwardRefs.has(ref); })) add(node);
  }
  while (queue.length) {
    const node = queue.shift();
    if (node.type === "quest_definition") continue;
    for (const edge of index.outgoing.get(node.id) || []) {
      const owner = index.nodes.get(edge.toNodeId);
      if (owner && OWNER_INPUTS[owner.type]?.has(edge.toPort)) add(owner);
    }
    if (node.type === "dialogue_definition") {
      // Quest acceptance through a choice is a real backlink even when there
      // is no startDialogue edge on the quest.
      const children = [node.id];
      const seen = new Set();
      while (children.length) {
        const childId = children.shift();
        if (seen.has(childId)) continue;
        seen.add(childId);
        const child = index.nodes.get(childId);
        if (!child) continue;
        const childRefs = new Set(references(child, nodeTypes));
        for (const candidate of graph.nodes || []) {
          if (candidate.type === "quest_definition" && childRefs.has(canonical(candidate.values?.questId))) add(candidate);
        }
        for (const edge of index.incoming.get(childId) || []) {
          if (OWNER_INPUTS[child.type]?.has(edge.toPort)) children.push(edge.fromNodeId);
        }
      }
    }
  }
  const nodes = Array.from(relationNodeIds).map(function (id) { return index.nodes.get(id); }).filter(Boolean);
  return {
    quests: humanSort(nodes.filter(function (node) { return node.type === "quest_definition"; })),
    dialogues: humanSort(nodes.filter(function (node) { return node.type === "dialogue_definition"; })),
    others: humanSort(nodes.filter(function (node) { return !DEFINITION_TYPES.has(node.type); })),
    localNodeIds,
    relationNodeIds
  };
}

/** Reverse navigation uses the exact same relationship resolution as the
 * object view, so a quest/dialogue cannot disagree with its object backlink. */
export function visualModelsForRelation(graph, nodeTypes, relationNodeId) {
  return humanSort((graph.nodes || []).filter(function (node) {
    return node.type === "model_entity"
      && visualObjectRelations(graph, nodeTypes, node.id).relationNodeIds.has(relationNodeId);
  }));
}

/** Clone and delete a selection, including group descendants and the attached
 * package of every removed model. Reusable definitions/dialogues/quests and
 * components with surviving graph consumers stay. Required target objectives
 * and marker rules are removed; optional typed links are detached. The caller
 * commits this graph with the normal restore/undo transaction. */
export function removeVisualObjects(graph, nodeTypes, nodeIds, edgeIds = []) {
  const next = JSON.parse(JSON.stringify(graph));
  const index = indexGraph(next);
  const removed = new Set(nodeIds || []);
  const removedEdges = new Set(edgeIds || []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of next.nodes || []) {
      if (removed.has(node.parentId) && !removed.has(node.id)) {
        removed.add(node.id);
        changed = true;
      }
    }
  }
  for (const node of next.nodes || []) {
    if (node.type !== "model_entity" || !removed.has(node.id)) continue;
    for (const edge of index.outgoing.get(node.id) || []) {
      if (edge.fromPort !== "entity" || edge.toPort !== "model" || index.nodes.get(edge.toNodeId)?.type !== "entity_assembly") continue;
      const otherModel = (index.incoming.get(edge.toNodeId) || []).some(function (candidate) {
        return candidate.toPort === "model" && !removed.has(candidate.fromNodeId) && !removedEdges.has(candidate.id);
      });
      if (!otherModel) removed.add(edge.toNodeId);
    }
  }
  const removedOwnerRefs = new Set((next.nodes || []).filter(function (node) {
    return removed.has(node.id) && ["model_entity", "entity_assembly"].includes(node.type);
  }).flatMap(function (node) { return identities(node, nodeTypes); }));
  for (const node of next.nodes || []) {
    const outgoing = index.outgoing.get(node.id) || [];
    const component = outgoing.some(function (edge) {
      return edge.fromPort === "component" && edge.toPort === "components"
        && index.nodes.get(edge.toNodeId)?.type === "entity_assembly" && removed.has(edge.toNodeId);
    });
    if (component && !outgoing.some(function (edge) { return !removed.has(edge.toNodeId) && !removedEdges.has(edge.id); })) removed.add(node.id);
    if (node.type !== "quest_target_binding") continue;
    const entityEdges = (index.incoming.get(node.id) || []).filter(function (edge) {
      return edge.toPort === "entity" && edge.fromPort === "entity" && !removedEdges.has(edge.id);
    });
    const owned = removedOwnerRefs.has(canonical(node.values?.entityRef))
      || entityEdges.some(function (edge) { return removed.has(edge.fromNodeId); });
    if (owned && !entityEdges.some(function (edge) { return !removed.has(edge.fromNodeId); })) removed.add(node.id);
  }
  const removedPortalLinkRefs = new Set((next.nodes || []).filter(function (node) {
    return removed.has(node.id) && node.type === "portal_component";
  }).map(function (node) {
    return canonical(node.values?.zoneLinkRef);
  }).filter(Boolean));
  const removedPortalRefs = new Set((next.nodes || []).filter(function (node) {
    return removed.has(node.id) && node.type === "portal_component";
  }).map(function (node) {
    return canonical(node.values?.componentId);
  }).filter(Boolean));
  const retainedPortalLinkRefs = new Set((next.nodes || []).filter(function (node) {
    return !removed.has(node.id) && node.type === "portal_component";
  }).map(function (node) {
    return canonical(node.values?.zoneLinkRef);
  }).filter(Boolean));
  for (const ref of retainedPortalLinkRefs) removedPortalLinkRefs.delete(ref);
  for (const node of next.nodes || []) {
    if (node.type !== "zone_link") continue;
    if (removedPortalLinkRefs.has(canonical(node.values?.linkId))
      || removedPortalRefs.has(canonical(node.values?.toPortalRef))) removed.add(node.id);
  }
  const removedIdentities = function () {
    const refs = new Set();
    const retained = new Set();
    for (const node of next.nodes || []) {
      for (const ref of identities(node, nodeTypes)) (removed.has(node.id) ? refs : retained).add(ref);
    }
    // Do not erase a valid shared canonical reference merely because another
    // (historically duplicated) producer happened to use the same identity.
    for (const ref of retained) refs.delete(ref);
    return refs;
  };
  changed = true;
  while (changed) {
    changed = false;
    const refs = removedIdentities();
    for (const node of next.nodes || []) {
      if (removed.has(node.id) || !(node.type.startsWith("objective_") || node.type === "quest_marker_rule")) continue;
      const requiredLost = Object.entries(nodeTypes?.[node.type]?.fields || {}).some(function ([key, field]) {
        return field.type === "reference" && field.required && field.allowNull !== true && refs.has(canonical(node.values?.[key]));
      });
      if (requiredLost) {
        removed.add(node.id);
        changed = true;
      }
    }
  }
  const refs = removedIdentities();
  for (const node of next.nodes || []) {
    if (removed.has(node.id)) continue;
    for (const [key, field] of Object.entries(nodeTypes?.[node.type]?.fields || {})) {
      if (field.type === "referenceList") {
        const values = normalizeReferenceList(node.values?.[key]);
        if (values.some(function (ref) { return refs.has(ref); })) node.values[key] = values.filter(function (ref) { return !refs.has(ref); });
      } else if (field.type === "reference" && refs.has(canonical(node.values?.[key]))) {
        if (field.required && field.allowNull !== true) {
          throw new Error("Kan dit object nog niet verwijderen: " + (node.values?.displayName || node.values?.label || nodeTypes?.[node.type]?.label || node.type)
            + " heeft nog een verplichte koppeling (" + field.label + "). Ontkoppel deze eerst.");
        }
        node.values[key] = null;
      }
    }
  }
  next.nodes = (next.nodes || []).filter(function (node) { return !removed.has(node.id); });
  next.edges = (next.edges || []).filter(function (edge) {
    return !removed.has(edge.fromNodeId) && !removed.has(edge.toNodeId) && !removedEdges.has(edge.id);
  });
  return next;
}
