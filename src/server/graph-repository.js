import crypto from "node:crypto";
import {
  NODE_TYPES,
  STARTER_EDGES,
  STARTER_NODES,
  defaultValuesForType,
  normalizeGroupInterface,
  resolveNodePort,
  resolveNodePorts,
  isContainer
} from "../shared/node-types.js";
import { cleanValuesForType } from "./field-validation.js";

const now = function () {
  return new Date().toISOString();
};

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function toNode(row) {
  const definition = NODE_TYPES[row.type];
  const values = parseJson(row.values_json, defaultValuesForType(row.type));
  if (row.type === "group") values.groupInterface = normalizeGroupInterface(values.groupInterface);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    x: row.x,
    y: row.y,
    parentId: row.parent_id || null,
    values: values,
    definition,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function graphError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function identityFieldKeys(definition) {
  return Object.entries(definition?.fields || {}).filter(function ([, field]) {
    return field && field.type === "text" && field.pattern === "^[a-z0-9_:-]+$";
  }).map(function ([key]) {
    return key;
  });
}

function uniqueIdentityValue(baseValue, field, existingValues) {
  const maxLength = Math.max(1, Number(field?.maxLength) || 64);
  const existing = new Set((existingValues || []).filter(function (value) {
    return typeof value === "string" && value.trim();
  }).map(function (value) {
    return value.trim();
  }));
  const raw = String(baseValue || "").trim();
  if (!raw) return raw;
  if (!existing.has(raw)) return raw.slice(0, maxLength);
  let counter = 2;
  let next = raw;
  while (existing.has(next)) {
    const suffix = "_" + counter;
    const base = raw.slice(0, Math.max(1, maxLength - suffix.length));
    next = (base + suffix).slice(0, maxLength);
    counter += 1;
  }
  return next;
}

function uniquifyIdentityFields(type, values, rows) {
  const definition = NODE_TYPES[type];
  if (!definition) return values;
  const nextValues = Object.assign({}, values);
  for (const key of identityFieldKeys(definition)) {
    const field = definition.fields[key];
    if (!field) continue;
    const existingValues = (rows || []).map(function (row) {
      const parsed = parseJson(row.values_json, defaultValuesForType(type));
      return parsed ? parsed[key] : null;
    }).filter(Boolean);
    nextValues[key] = uniqueIdentityValue(nextValues[key], field, existingValues);
  }
  return nextValues;
}

function isGroupSystemNodeType(type) {
  return type === "group_input" || type === "group_output";
}

function groupSystemNodeId(groupId, kind) {
  return "group_" + kind + "__" + groupId;
}

function humanizePortLabel(portName) {
  return String(portName || "")
    .replace(/[_:-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); }) || String(portName || "");
}

function applyGroupInterfaceBackfill(nodes, edges, nodeMap) {
  const groups = nodes.filter(function (node) { return node.type === "group"; });
  let changed = false;
  for (let pass = 0; pass < 4; pass += 1) {
    let passChanged = false;
    const currentNodeMap = new Map(nodes.map(function (node) { return [node.id, node]; }));
    for (const group of groups) {
      const currentInterface = normalizeGroupInterface(group.values.groupInterface);
      const nextInterface = {
        inputs: currentInterface.inputs.map(function (port) { return Object.assign({}, port); }),
        outputs: currentInterface.outputs.map(function (port) { return Object.assign({}, port); })
      };
      const inputNames = new Set(nextInterface.inputs.map(function (port) { return port.name; }));
      const outputNames = new Set(nextInterface.outputs.map(function (port) { return port.name; }));
      let groupChanged = false;
      for (const edge of edges) {
        const fromNode = currentNodeMap.get(edge.fromNodeId);
        const toNode = currentNodeMap.get(edge.toNodeId);
        if (!fromNode || !toNode) continue;
        if ((fromNode.parentId || null) !== group.id || (toNode.parentId || null) !== group.id) continue;
        if (fromNode.type === "group_input" && typeof edge.fromPort === "string" && edge.fromPort && !inputNames.has(edge.fromPort)) {
          const resolvedTarget = resolveNodePort(toNode, edge.toPort, "input", currentNodeMap);
          if (resolvedTarget && resolvedTarget.dataType) {
            nextInterface.inputs.push({
              id: edge.fromPort,
              name: edge.fromPort,
              label: humanizePortLabel(edge.fromPort),
              dataType: resolvedTarget.dataType,
              multiple: resolvedTarget.multiple === undefined ? false : Boolean(resolvedTarget.multiple)
            });
            inputNames.add(edge.fromPort);
            groupChanged = true;
          }
        }
        if (toNode.type === "group_output" && typeof edge.toPort === "string" && edge.toPort && !outputNames.has(edge.toPort)) {
          const resolvedSource = resolveNodePort(fromNode, edge.fromPort, "output", currentNodeMap);
          if (resolvedSource && resolvedSource.dataType) {
            nextInterface.outputs.push({
              id: edge.toPort,
              name: edge.toPort,
              label: humanizePortLabel(edge.toPort),
              dataType: resolvedSource.dataType,
              multiple: resolvedSource.multiple === undefined ? false : Boolean(resolvedSource.multiple)
            });
            outputNames.add(edge.toPort);
            groupChanged = true;
          }
        }
      }
      if (groupChanged) {
        group.values.groupInterface = nextInterface;
        passChanged = true;
      }
    }
    if (!passChanged) break;
    changed = true;
  }
  return changed;
}

function uniqueGroupPortName(baseName, interfaceState) {
  const allPorts = [
    ...(Array.isArray(interfaceState?.inputs) ? interfaceState.inputs : []),
    ...(Array.isArray(interfaceState?.outputs) ? interfaceState.outputs : [])
  ];
  const existing = new Set(allPorts.map(function (port) {
    return String(port?.name || "").trim();
  }).filter(Boolean));
  if (!existing.has(baseName)) return baseName;
  let index = 2;
  while (existing.has(baseName + "_" + index)) index += 1;
  return baseName + "_" + index;
}

function findGroupPortByDataType(ports, dataType) {
  return (Array.isArray(ports) ? ports : []).find(function (port) {
    return port && port.dataType === dataType;
  }) || null;
}

function ensureGroupEntityOutputPortInRow(row) {
  const values = parseJson(row?.values_json, defaultValuesForType("group"));
  const groupInterface = normalizeGroupInterface(values.groupInterface);
  const existing = findGroupPortByDataType(groupInterface.outputs, "entity");
  let changed = false;
  let portName = null;
  if (existing) {
    portName = existing.name;
    if (existing.multiple === false) {
      existing.multiple = true;
      changed = true;
    }
    if (!existing.label) {
      existing.label = "Entities";
      changed = true;
    }
  } else {
    portName = uniqueGroupPortName("entities", groupInterface);
    groupInterface.outputs.push({
      id: portName,
      name: portName,
      label: "Entities",
      dataType: "entity",
      multiple: true
    });
    changed = true;
  }
  if (changed) values.groupInterface = groupInterface;
  return { values: values, portName: portName, changed: changed };
}

function removedGroupPortNames(beforePorts, afterPorts) {
  const before = new Set((Array.isArray(beforePorts) ? beforePorts : []).map(function (port) {
    return String(port?.name || "").trim();
  }).filter(Boolean));
  const after = new Set((Array.isArray(afterPorts) ? afterPorts : []).map(function (port) {
    return String(port?.name || "").trim();
  }).filter(Boolean));
  return Array.from(before).filter(function (name) {
    return !after.has(name);
  });
}

function deleteGroupPortEdges(db, groupId, removedInputPorts, removedOutputPorts) {
  const inputPorts = Array.from(new Set((removedInputPorts || []).filter(Boolean)));
  const outputPorts = Array.from(new Set((removedOutputPorts || []).filter(Boolean)));
  if (!inputPorts.length && !outputPorts.length) return false;
  const groupInput = db.prepare("SELECT id FROM editor_nodes WHERE parent_id = ? AND type = 'group_input' LIMIT 1").get(groupId);
  const groupOutput = db.prepare("SELECT id FROM editor_nodes WHERE parent_id = ? AND type = 'group_output' LIMIT 1").get(groupId);
  let changed = false;
  const deleteInputEdge = db.prepare("DELETE FROM editor_node_edges WHERE from_node_id = ? AND from_port = ?");
  const deleteOutputEdge = db.prepare("DELETE FROM editor_node_edges WHERE to_node_id = ? AND to_port = ?");
  db.exec("BEGIN");
  try {
    if (groupInput) {
      for (const portName of inputPorts) {
        const result = deleteInputEdge.run(groupInput.id, portName);
        changed = changed || result.changes > 0;
      }
    }
    if (groupOutput) {
      for (const portName of outputPorts) {
        const result = deleteOutputEdge.run(groupOutput.id, portName);
        changed = changed || result.changes > 0;
      }
    }
    db.exec("COMMIT");
    return changed;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function pruneInvalidEdges(db, edges, nodeMap) {
  const invalidEdgeIds = [];
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.fromNodeId);
    const toNode = nodeMap.get(edge.toNodeId);
    if (!fromNode || !toNode) {
      invalidEdgeIds.push(edge.id);
      continue;
    }
    if ((fromNode.parentId || null) !== (toNode.parentId || null)) {
      invalidEdgeIds.push(edge.id);
    }
  }
  if (!invalidEdgeIds.length) return false;
  db.exec("BEGIN");
  try {
    const deleteEdge = db.prepare("DELETE FROM editor_node_edges WHERE id = ?");
    for (const edgeId of invalidEdgeIds) deleteEdge.run(edgeId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function normalizeSnapshotNode(node) {
  if (!node || typeof node !== "object") throw graphError("Graph snapshot bevat een ongeldige node.");
  if (typeof node.id !== "string" || !node.id) throw graphError("Graph snapshot node mist een id.");
  if (typeof node.type !== "string" || !NODE_TYPES[node.type]) throw graphError("Graph snapshot node heeft een onbekend type: " + node.type + ".");
  const title = typeof node.title === "string" && node.title ? node.title : NODE_TYPES[node.type].label;
  const values = node.values && typeof node.values === "object" ? node.values : {};
  if (node.type === "group") values.groupInterface = normalizeGroupInterface(values.groupInterface);
  return {
    id: node.id,
    type: node.type,
    title: title,
    x: Number.isFinite(Number(node.x)) ? Math.round(Number(node.x)) : 0,
    y: Number.isFinite(Number(node.y)) ? Math.round(Number(node.y)) : 0,
    parentId: node.parentId || null,
    values: cleanValuesForType(node.type, values, {}, NODE_TYPES)
  };
}

function sortNodesForRestore(nodes) {
  const nodeMap = new Map(nodes.map(function (node) { return [node.id, node]; }));
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(node) {
    if (visited.has(node.id)) return;
    if (visiting.has(node.id)) throw graphError("Graph snapshot bevat een cirkel in parent-relaties.");
    visiting.add(node.id);
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      if (!parent) throw graphError("Graph snapshot node " + node.id + " verwijst naar een onbekende parent.");
      if (!isContainer(parent.type)) throw graphError("Graph snapshot node " + node.id + " heeft een parent die geen group is.");
      visit(parent);
    }
    visiting.delete(node.id);
    visited.add(node.id);
    ordered.push(node);
  }
  for (const node of nodes) visit(node);
  return ordered;
}

export class GraphRepository {
  constructor(db) {
    this.db = db;
  }

  seedIfEmpty() {
    const count = this.db.prepare("SELECT COUNT(*) AS total FROM editor_nodes").get().total;
    if (count > 0) return;
    const insertNode = this.db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertEdge = this.db.prepare("INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    this.db.exec("BEGIN");
    try {
      for (const node of STARTER_NODES) {
        const values = cleanValuesForType(node.type, node.values || {}, {}, NODE_TYPES);
        insertNode.run(node.id, node.type, node.title, node.x, node.y, node.parentId || null, JSON.stringify(values), now(), now());
      }
      for (const edge of STARTER_EDGES) {
        insertEdge.run(edge.id, edge.fromNodeId, edge.fromPort, edge.toNodeId, edge.toPort, now());
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  ensureGroupSystemNodes() {
    const groups = this.db.prepare("SELECT id FROM editor_nodes WHERE type = 'group'").all();
    if (!groups.length) return false;
    const hasChild = this.db.prepare("SELECT id FROM editor_nodes WHERE parent_id = ? AND type = ? LIMIT 1");
    const insertNode = this.db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    let changed = false;
    this.db.exec("BEGIN");
    try {
      for (const group of groups) {
        if (!hasChild.get(group.id, "group_input")) {
          insertNode.run(groupSystemNodeId(group.id, "input"), "group_input", "Group Input", 120, 120, group.id, "{}", now(), now());
          changed = true;
        }
        if (!hasChild.get(group.id, "group_output")) {
          insertNode.run(groupSystemNodeId(group.id, "output"), "group_output", "Group Output", 420, 120, group.id, "{}", now(), now());
          changed = true;
        }
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    if (changed) this.clearDraftWorld();
    return changed;
  }

  getGraph() {
    this.ensureGroupSystemNodes();
    const nodes = this.db.prepare("SELECT * FROM editor_nodes ORDER BY y, x").all().map(toNode);
    const nodeMap = new Map(nodes.map(function (node) { return [node.id, node]; }));
    let edges = this.db.prepare("SELECT * FROM editor_node_edges ORDER BY created_at, id").all().map(function (row) {
      return {
        id: row.id,
        fromNodeId: row.from_node_id,
        fromPort: row.from_port,
        toNodeId: row.to_node_id,
        toPort: row.to_port,
        createdAt: row.created_at
      };
    });
    if (pruneInvalidEdges(this.db, edges, nodeMap)) {
      this.clearDraftWorld();
      edges = this.db.prepare("SELECT * FROM editor_node_edges ORDER BY created_at, id").all().map(function (row) {
        return {
          id: row.id,
          fromNodeId: row.from_node_id,
          fromPort: row.from_port,
          toNodeId: row.to_node_id,
          toPort: row.to_port,
          createdAt: row.created_at
        };
      });
    }
    const changed = applyGroupInterfaceBackfill(nodes, edges, nodeMap);
    if (changed) {
      this.db.exec("BEGIN");
      try {
        const updateNode = this.db.prepare("UPDATE editor_nodes SET values_json = ?, updated_at = ? WHERE id = ?");
        for (const node of nodes) {
          if (node.type !== "group") continue;
          updateNode.run(JSON.stringify(node.values), now(), node.id);
        }
        this.db.exec("COMMIT");
        this.clearDraftWorld();
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    }
    const refreshedNodeMap = new Map(nodes.map(function (node) { return [node.id, node]; }));
    for (const node of nodes) node.ports = resolveNodePorts(node, refreshedNodeMap);
    return { schemaVersion: "2.0.0", nodes, edges, nodeTypes: NODE_TYPES };
  }

  nodeExists(id) {
    return Boolean(this.db.prepare("SELECT id FROM editor_nodes WHERE id = ?").get(id));
  }

  clearDraftWorld() {
    this.db.prepare("DELETE FROM draft_world_state WHERE id = 1").run();
  }

  ensureModelEntityWiring(nodeId) {
    const row = this.db.prepare("SELECT id, type, parent_id FROM editor_nodes WHERE id = ?").get(nodeId);
    if (!row || row.type !== "model_entity") return false;
    const existing = this.db.prepare("SELECT id FROM editor_node_edges WHERE from_node_id = ? AND from_port = 'entity' LIMIT 1").get(nodeId);
    if (existing) return false;
    const insertEdge = this.db.prepare("INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at) VALUES (?, ?, ?, ?, ?, ?)");
    let targetNode = null;
    let targetPort = "entities";
    let changed = false;
    if (row.parent_id) {
      const parent = this.db.prepare("SELECT * FROM editor_nodes WHERE id = ?").get(row.parent_id);
      if (!parent || parent.type !== "group") return false;
      const ensured = ensureGroupEntityOutputPortInRow(parent);
      if (ensured.changed) {
        this.db.prepare("UPDATE editor_nodes SET values_json = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(ensured.values), now(), parent.id);
        changed = true;
      }
      targetNode = this.db.prepare("SELECT id FROM editor_nodes WHERE parent_id = ? AND type = 'group_output' LIMIT 1").get(parent.id);
      if (!targetNode) return changed;
      targetPort = ensured.portName;
    } else {
      targetNode = this.db.prepare("SELECT id FROM editor_nodes WHERE type = 'game_output' LIMIT 1").get();
      if (!targetNode) return false;
    }
    const alreadyConnected = this.db.prepare("SELECT id FROM editor_node_edges WHERE from_node_id = ? AND from_port = 'entity' AND to_node_id = ? AND to_port = ? LIMIT 1")
      .get(nodeId, targetNode.id, targetPort);
    if (alreadyConnected) return changed;
    insertEdge.run("edge_" + crypto.randomUUID().slice(0, 10), nodeId, "entity", targetNode.id, targetPort, now());
    return true;
  }

  createNode(type, position, values = {}, parentId = null) {
    const definition = NODE_TYPES[type];
    if (!definition) {
      const error = new Error("Onbekend node-type: " + type);
      error.status = 400;
      throw error;
    }
    if (isGroupSystemNodeType(type)) {
      const error = new Error("Group system nodes worden automatisch beheerd.");
      error.status = 400;
      throw error;
    }
    if (parentId) {
      const parent = this.db.prepare("SELECT type FROM editor_nodes WHERE id = ?").get(parentId);
      if (!parent || !isContainer(parent.type)) {
        const error = new Error("Parent is geen group.");
        error.status = 400;
        throw error;
      }
    }
    const count = this.db.prepare("SELECT COUNT(*) AS total FROM editor_nodes WHERE type = ?").get(type).total;
    const id = "node_" + type + "_" + crypto.randomUUID().slice(0, 8);
    const title = definition.label + " " + String(count + 1).padStart(2, "0");
    const x = Number.isFinite(Number(position?.x)) ? Number(position.x) : 160 + count * 26;
    const y = Number.isFinite(Number(position?.y)) ? Number(position.y) : 160 + count * 26;
    const cleanValues = cleanValuesForType(type, values, {}, NODE_TYPES);
    const identityRows = this.db.prepare("SELECT values_json FROM editor_nodes WHERE type = ?").all(type);
    const nextValues = uniquifyIdentityFields(type, cleanValues, identityRows);
    this.db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .run(id, type, title, Math.round(x), Math.round(y), parentId || null, JSON.stringify(nextValues), now(), now());
    if (type === "model_entity") this.ensureModelEntityWiring(id);
    this.clearDraftWorld();
    return { graph: this.getGraph(), nodeId: id };
  }

  deleteNode(nodeId) {
    const row = this.db.prepare("SELECT type FROM editor_nodes WHERE id = ?").get(nodeId);
    if (!row) {
      const error = new Error("Node bestaat niet: " + nodeId);
      error.status = 404;
      throw error;
    }
    if (row.type === "game_output") {
      const error = new Error("De Game Output node kan niet verwijderd worden.");
      error.status = 400;
      throw error;
    }
    if (isGroupSystemNodeType(row.type)) {
      const error = new Error("Group system nodes kunnen niet verwijderd worden.");
      error.status = 400;
      throw error;
    }
    this.db.prepare("DELETE FROM editor_nodes WHERE id = ?").run(nodeId);
    this.clearDraftWorld();
    return this.getGraph();
  }

  duplicateNode(nodeId) {
    const row = this.db.prepare("SELECT * FROM editor_nodes WHERE id = ?").get(nodeId);
    if (!row) {
      const error = new Error("Node bestaat niet: " + nodeId);
      error.status = 404;
      throw error;
    }
    if (row.type === "game_output") {
      const error = new Error("De Game Output node kan niet gedupliceerd worden.");
      error.status = 400;
      throw error;
    }
    if (isGroupSystemNodeType(row.type)) {
      const error = new Error("Group system nodes kunnen niet gedupliceerd worden.");
      error.status = 400;
      throw error;
    }
    const values = parseJson(row.values_json, defaultValuesForType(row.type));
    return this.createNode(row.type, { x: row.x + 40, y: row.y + 40 }, values, row.parent_id || null);
  }

  createModelEntityFromAsset(asset, worldPosition = {}, parentId = null) {
    if (asset.assetType !== "model") {
      const error = new Error("Alleen model-assets kunnen als Model Entity geplaatst worden.");
      error.status = 400;
      throw error;
    }
    const defaultAnimation = asset.metadata?.defaultAnimation || null;
    const values = {
      entityId: "entity_" + asset.id.replace("asset_", "").slice(0, 8) + "_" + crypto.randomUUID().slice(0, 8),
      label: asset.name,
      modelAssetId: asset.id,
      animationClip: defaultAnimation,
      idleAnimation: defaultAnimation,
      walkAnimation: null,
      runAnimation: null,
      x: Number.isFinite(Number(worldPosition.x)) ? Number(worldPosition.x) : 0,
      y: Number.isFinite(Number(worldPosition.y)) ? Number(worldPosition.y) : 0,
      z: Number.isFinite(Number(worldPosition.z)) ? Number(worldPosition.z) : 0,
      rotationY: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      solid: false,
      collisionRadius: 1
    };
    const parent = parentId ? this.db.prepare("SELECT type FROM editor_nodes WHERE id = ?").get(parentId) : null;
    const validParentId = parent && isContainer(parent.type) ? parentId : null;
    const count = this.db.prepare("SELECT COUNT(*) AS total FROM editor_nodes WHERE type = 'model_entity'").get().total;
    return this.createNode("model_entity", { x: 560 + count * 26, y: 200 + count * 26 }, values, validParentId);
  }

  updateNodeValues(nodeId, nextValues) {
    const row = this.db.prepare("SELECT * FROM editor_nodes WHERE id = ?").get(nodeId);
    if (!row) {
      const error = new Error("Node bestaat niet: " + nodeId);
      error.status = 404;
      throw error;
    }
    const currentValues = parseJson(row.values_json, defaultValuesForType(row.type));
    const cleanValues = cleanValuesForType(row.type, nextValues || {}, currentValues, NODE_TYPES);
    if (row.type === "group") {
      const currentInterface = normalizeGroupInterface(currentValues.groupInterface);
      const nextInterface = normalizeGroupInterface(cleanValues.groupInterface);
      const removedInputs = removedGroupPortNames(currentInterface.inputs, nextInterface.inputs);
      const removedOutputs = removedGroupPortNames(currentInterface.outputs, nextInterface.outputs);
      if (removedInputs.length || removedOutputs.length) {
        deleteGroupPortEdges(this.db, nodeId, removedInputs, removedOutputs);
      }
    }
    this.db.prepare("UPDATE editor_nodes SET values_json = ?, updated_at = ? WHERE id = ?")
      .run(JSON.stringify(cleanValues), now(), nodeId);
    this.clearDraftWorld();
    return this.getGraph();
  }

  updateNodePosition(nodeId, position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const error = new Error("Nodepositie moet geldige x/y nummers bevatten.");
      error.status = 400;
      throw error;
    }
    const result = this.db.prepare("UPDATE editor_nodes SET x = ?, y = ?, updated_at = ? WHERE id = ?")
      .run(Math.round(x), Math.round(y), now(), nodeId);
    if (result.changes === 0) {
      const error = new Error("Node bestaat niet: " + nodeId);
      error.status = 404;
      throw error;
    }
    this.clearDraftWorld();
    return this.getGraph();
  }

  createEdge(edge) {
    const rows = this.db.prepare("SELECT * FROM editor_nodes").all();
    const nodeMap = new Map(rows.map(function (row) { return [row.id, toNode(row)]; }));
    const from = nodeMap.get(edge?.fromNodeId);
    const to = nodeMap.get(edge?.toNodeId);
    if (!from || !to) {
      const error = new Error("Edge verwijst naar een onbekende node.");
      error.status = 400;
      throw error;
    }
    if ((from.parentId || null) !== (to.parentId || null)) {
      const error = new Error("Edges mogen geen group-grenzen overschrijden; verbind via de group interface.");
      error.status = 400;
      throw error;
    }
    const fromPort = resolveNodePort(from, edge.fromPort, "output", nodeMap);
    const toPort = resolveNodePort(to, edge.toPort, "input", nodeMap);
    if (!fromPort || !toPort) {
      const error = new Error("Edge gebruikt een onbekende poort.");
      error.status = 400;
      throw error;
    }
    if (fromPort.dataType !== toPort.dataType) {
      const error = new Error("Poorttypes passen niet: " + fromPort.dataType + " naar " + toPort.dataType + ".");
      error.status = 400;
      throw error;
    }
    if (from.id === to.id) {
      const error = new Error("Een node kan niet met zichzelf verbonden worden.");
      error.status = 400;
      throw error;
    }
    if (!toPort.multiple) {
      const existing = this.db.prepare("SELECT COUNT(*) AS total FROM editor_node_edges WHERE to_node_id = ? AND to_port = ?").get(to.id, edge.toPort).total;
      if (existing > 0) {
        const error = new Error("Inputpoort " + edge.toPort + " accepteert maar een verbinding.");
        error.status = 400;
        throw error;
      }
    }
    this.db.prepare("INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("edge_" + crypto.randomUUID().slice(0, 10), from.id, edge.fromPort, to.id, edge.toPort, now());
    this.clearDraftWorld();
    return this.getGraph();
  }

  deleteEdge(edgeId) {
    this.db.prepare("DELETE FROM editor_node_edges WHERE id = ?").run(edgeId);
    this.clearDraftWorld();
    return this.getGraph();
  }

  restoreGraph(snapshot) {
    const graph = snapshot?.graph || snapshot || {};
    const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const rawEdges = Array.isArray(graph.edges) ? graph.edges : [];
    const seen = new Set();
    const nodes = rawNodes.map(function (node) {
      const normalized = normalizeSnapshotNode(node);
      if (seen.has(normalized.id)) throw graphError("Graph snapshot bevat dubbele node id: " + normalized.id + ".");
      seen.add(normalized.id);
      return normalized;
    });
    const orderedNodes = sortNodesForRestore(nodes);
    const nodeMap = new Map(orderedNodes.map(function (node) { return [node.id, node]; }));
    const edges = rawEdges.map(function (edge) {
      if (!edge || typeof edge !== "object") throw graphError("Graph snapshot bevat een ongeldige edge.");
      if (typeof edge.id !== "string" || !edge.id) throw graphError("Graph snapshot edge mist een id.");
      if (typeof edge.fromNodeId !== "string" || typeof edge.toNodeId !== "string") throw graphError("Graph snapshot edge mist node ids.");
      if (!nodeMap.has(edge.fromNodeId) || !nodeMap.has(edge.toNodeId)) {
        throw graphError("Graph snapshot edge " + edge.id + " verwijst naar onbekende nodes.");
      }
      return {
        id: edge.id,
        fromNodeId: edge.fromNodeId,
        fromPort: edge.fromPort,
        toNodeId: edge.toNodeId,
        toPort: edge.toPort
      };
    });
    applyGroupInterfaceBackfill(nodes, edges, nodeMap);
    const refreshedNodeMap = new Map(nodes.map(function (node) { return [node.id, node]; }));
    const edgeCounts = new Map();
    for (const edge of edges) {
      const fromNode = refreshedNodeMap.get(edge.fromNodeId);
      const toNode = refreshedNodeMap.get(edge.toNodeId);
      if ((fromNode.parentId || null) !== (toNode.parentId || null)) {
        throw graphError("Graph snapshot edge " + edge.id + " overschrijdt een group-grens. Verbind via de group interface.");
      }
      const fromPort = resolveNodePort(fromNode, edge.fromPort, "output", refreshedNodeMap);
      const toPort = resolveNodePort(toNode, edge.toPort, "input", refreshedNodeMap);
      if (!fromPort) throw graphError("Graph snapshot edge " + edge.id + " gebruikt onbekende outputpoort " + edge.fromPort + ".");
      if (!toPort) throw graphError("Graph snapshot edge " + edge.id + " gebruikt onbekende inputpoort " + edge.toPort + ".");
      if (fromPort.dataType !== toPort.dataType) {
        throw graphError("Graph snapshot edge " + edge.id + " verbindt " + fromPort.dataType + " met " + toPort.dataType + ".");
      }
      const edgeKey = edge.toNodeId + "::" + edge.toPort;
      const count = edgeCounts.get(edgeKey) || 0;
      if (!toPort.multiple && count > 0) {
        throw graphError("Graph snapshot input " + edge.toPort + " accepteert maar een verbinding.");
      }
      edgeCounts.set(edgeKey, count + 1);
    }
    this.db.exec("BEGIN");
    try {
      this.db.prepare("DELETE FROM editor_node_edges").run();
      this.db.prepare("DELETE FROM editor_nodes").run();
      const insertNode = this.db.prepare("INSERT INTO editor_nodes (id, type, title, x, y, parent_id, values_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
      const insertEdge = this.db.prepare("INSERT INTO editor_node_edges (id, from_node_id, from_port, to_node_id, to_port, created_at) VALUES (?, ?, ?, ?, ?, ?)");
      for (const node of orderedNodes) {
        insertNode.run(node.id, node.type, node.title, node.x, node.y, node.parentId || null, JSON.stringify(node.values), now(), now());
      }
      for (const edge of edges) {
        insertEdge.run(edge.id, edge.fromNodeId, edge.fromPort, edge.toNodeId, edge.toPort, now());
      }
      for (const node of orderedNodes) {
        if (node.type === "model_entity") this.ensureModelEntityWiring(node.id);
      }
      this.clearDraftWorld();
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return this.getGraph();
  }

  saveDraftWorld(world) {
    this.db.prepare("INSERT INTO draft_world_state (id, world_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET world_json = excluded.world_json, updated_at = excluded.updated_at")
      .run(JSON.stringify(world), now());
  }

  publishWorld(world, actorUserId) {
    const publishedAt = now();
    this.db.prepare("INSERT INTO published_world_state (id, world_json, published_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET world_json = excluded.world_json, published_at = excluded.published_at")
      .run(JSON.stringify(world), publishedAt);
    this.db.prepare("INSERT INTO publish_history (id, world_json, actor_user_id, published_at) VALUES (?, ?, ?, ?)")
      .run(crypto.randomUUID(), JSON.stringify(world), actorUserId || null, publishedAt);
  }

  getDraftWorld() {
    const row = this.db.prepare("SELECT world_json FROM draft_world_state WHERE id = 1").get();
    return row ? parseJson(row.world_json, null) : null;
  }

  getPublishedWorld() {
    const row = this.db.prepare("SELECT world_json, published_at FROM published_world_state WHERE id = 1").get();
    if (!row) return null;
    return Object.assign(parseJson(row.world_json, {}), { publishedAt: row.published_at });
  }

  publishHistory(limit = 20) {
    return this.db.prepare("SELECT id, actor_user_id, published_at FROM publish_history ORDER BY published_at DESC LIMIT ?").all(limit);
  }
}
