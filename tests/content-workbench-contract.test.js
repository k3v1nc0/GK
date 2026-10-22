import assert from "node:assert/strict";
import test from "node:test";
import { NODE_TYPES } from "../src/shared/node-types.js";
import {
  CHILD_ROW_SPECS,
  CONTENT_TYPE_SPECS,
  OVERVIEW_BANDS,
  WORKBENCH_CATEGORIES,
  buildContentIndex,
  relationScope
} from "../apps/web/public/editor/content-workbench.js";

// Read-only W2 contract check: every relation the Workbench draws must be a
// real typed schema field or child-node port. Expected kinds are hand-written
// here, independent from the module under test.
const KIND_FOR_TARGET = {
  item_definition: "item",
  currency_definition: "currency",
  loot_table: "loot_table",
  ability_definition: "ability",
  stat_definition: "stat",
  stat_block: "stat_block",
  combat_profile: "combat_profile"
};

function referenceKinds(field) {
  return Array.isArray(field?.referenceKinds) ? field.referenceKinds : [];
}

test("Workbench spec only uses real catalog definition types and fields", function () {
  const categoryTypes = WORKBENCH_CATEGORIES.map(function (category) { return category.type; }).filter(Boolean);
  assert.deepEqual(categoryTypes.slice().sort(), Object.keys(CONTENT_TYPE_SPECS).sort());
  for (const band of OVERVIEW_BANDS) {
    for (const column of band.columns) {
      for (const type of column.types) assert.ok(CONTENT_TYPE_SPECS[type], band.id + "/" + column.id + " uses " + type);
    }
  }
  for (const [type, spec] of Object.entries(CONTENT_TYPE_SPECS)) {
    const def = NODE_TYPES[type];
    assert.ok(def, type + " exists");
    assert.ok(def.outputs?.catalogDefinition, type + " publishes through a Catalog Output");
    for (const key of spec.keyFields.concat(spec.createFields)) assert.ok(def.fields?.[key], type + "." + key + " exists");
    for (const key of spec.thumbAssets) assert.equal(def.fields?.[key]?.type, "asset", type + "." + key + " is an asset field");
    if (spec.children) {
      const input = def.inputs?.[spec.children.port];
      assert.ok(input?.multiple, type + "." + spec.children.port + " accepts multiple child rows");
      for (const childType of spec.children.types) {
        const outputs = Object.values(NODE_TYPES[childType]?.outputs || {});
        assert.ok(outputs.some(function (port) { return port.dataType === input.dataType; }), childType + " connects to " + type + "." + spec.children.port);
        assert.ok(CHILD_ROW_SPECS[childType], childType + " has a row spec");
      }
    }
    for (const relation of spec.relations) {
      if (relation.children) {
        assert.ok(spec.children, type + " child relation needs a child port");
        continue;
      }
      if (relation.json) {
        assert.equal(def.fields?.[relation.json]?.type, "json", type + "." + relation.json);
        continue;
      }
      const key = relation.listField || relation.field;
      const field = def.fields?.[key];
      assert.equal(field?.type, relation.listField ? "referenceList" : "reference", type + "." + key + " is typed");
      const expectedKind = KIND_FOR_TARGET[relation.through || relation.target];
      assert.ok(referenceKinds(field).includes(expectedKind), type + "." + key + " references " + expectedKind);
      if (relation.port) assert.ok(def.inputs?.[relation.port], type + " has compiler fallback port " + relation.port);
    }
  }
  for (const [childType, rowSpec] of Object.entries(CHILD_ROW_SPECS)) {
    for (const target of rowSpec.targets) {
      const field = NODE_TYPES[childType]?.fields?.[target.field];
      assert.equal(field?.type, "reference", childType + "." + target.field + " is a reference");
      assert.ok(referenceKinds(field).includes(KIND_FOR_TARGET[target.target]), childType + "." + target.field + " -> " + target.target);
    }
  }
});

test("derived index follows child edges and typed references, never names", function () {
  const node = function (id, type, values, parentId = "group_catalog") {
    return { id, type, title: values.displayName || type, x: 0, y: 0, parentId, values };
  };
  const graph = {
    nodes: [
      node("group_catalog", "group", { title: "Catalog", groupKind: "catalog" }, null),
      node("n_iron", "item_definition", { itemId: "item.iron_ore", displayName: "Iron Ore" }),
      node("n_gold", "currency_definition", { currencyId: "currency.gold", displayName: "Gold" }),
      node("n_rock", "resource_definition", { resourceId: "resource.iron_ore", displayName: "Iron Ore", yieldItemRefs: [] }),
      node("n_loot", "loot_table", { lootTableId: "loot_table.miner", displayName: "Miner" }),
      node("n_drop", "loot_item_entry", { entryId: "loot_entry.iron", itemRef: "item.iron_ore", chance: 0.5, minQuantity: 1, maxQuantity: 3 }),
      node("n_recipe", "recipe_definition", { recipeId: "recipe.bar", displayName: "Bar", outputItems: [{ itemRef: "item.iron_ore", amount: 2 }], outputCurrencies: [] }),
      node("n_ing", "recipe_ingredient", { ingredientId: "recipe_ingredient.gold", kind: "currency", currencyRef: "currency.gold", itemRef: "item.iron_ore", amount: 3 })
    ],
    edges: [
      { id: "e1", fromNodeId: "n_drop", fromPort: "lootEntry", toNodeId: "n_loot", toPort: "entries" },
      { id: "e2", fromNodeId: "n_ing", fromPort: "ingredient", toNodeId: "n_recipe", toPort: "ingredients" }
    ]
  };
  const index = buildContentIndex(graph, NODE_TYPES);
  const has = function (kind, from, to) {
    return index.relations.some(function (relation) { return relation.kind === kind && relation.from === from && relation.to === to; });
  };
  assert.equal(index.definitions.length, 5, "child rows are not library items");
  assert.ok(has("loot_drop", "n_loot", "n_iron"));
  assert.ok(has("recipe_output", "n_recipe", "n_iron"));
  assert.ok(has("recipe_ingredient", "n_recipe", "n_gold"), "currency ingredient follows kind=currency");
  assert.ok(!has("recipe_ingredient", "n_recipe", "n_iron"), "stale itemRef on a currency ingredient is ignored");
  assert.ok(!index.relations.some(function (relation) { return relation.from === "n_rock" || relation.to === "n_rock"; }), "same name is not a relation");
  assert.equal(index.byNodeId.get("n_rock").usage.length, 0);
  assert.ok(index.byNodeId.get("n_iron").usage.some(function (usage) { return usage.sourceId === "n_recipe" && usage.field === "outputItems"; }), "JSON output counts as usage");
  const scope = relationScope(index, "n_iron", "used");
  assert.deepEqual(Array.from(scope.related.keys()).sort(), ["n_loot", "n_recipe"]);
});
