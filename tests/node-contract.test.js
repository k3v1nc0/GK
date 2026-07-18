import assert from "node:assert/strict";
import test from "node:test";
import {
  GAME_PROJECT_SCHEMA_VERSION,
  CANONICAL_ID_PATTERN,
  normalizeCanonicalId,
  normalizeReferenceList,
  normalizeTagList,
  normalizeTagQuery
} from "../src/shared/node-contract.js";
import { DATA_TYPE_COLORS, NODE_TYPES } from "../src/shared/node-types.js";

test("canonical ids and tag queries normalize consistently", function () {
  assert.match("global.game_name", CANONICAL_ID_PATTERN);
  assert.equal(normalizeCanonicalId("Gk.Project Name", ""), "gk.project.name");
  assert.deepEqual(normalizeReferenceList(["Zone.Start", "zone.start", "Spawn.Default"]), ["zone.start", "spawn.default"]);
  assert.deepEqual(normalizeTagList(["Global", "UI", "global"]), ["global", "ui"]);
  assert.deepEqual(normalizeTagQuery({ all: ["Global", "global"], any: ["UI"], none: ["Legacy"] }), {
    all: ["global"],
    any: ["ui"],
    none: ["legacy"]
  });
  assert.equal(GAME_PROJECT_SCHEMA_VERSION, "gk-game-project-v3");
});

test("Game Output exposes only gameProject as the normal authoring input", function () {
  const inputs = NODE_TYPES.game_output.inputs;
  assert.ok(inputs.gameProject);
  for (const [portName, port] of Object.entries(inputs)) {
    if (portName === "gameProject") {
      assert.equal(port.hidden, undefined);
      assert.equal(port.internal, undefined);
      assert.equal(port.deprecated, undefined);
    } else {
      assert.equal(port.hidden, true);
      assert.equal(port.internal, true);
      assert.equal(port.deprecated, true);
      assert.equal(port.required, false);
    }
  }
  assert.equal(NODE_TYPES.legacy_world_adapter.hidden, true);
  assert.equal(NODE_TYPES.legacy_world_adapter.system, true);
  assert.equal(NODE_TYPES.world_assembly.inputs.legacyWorld.hidden, true);
  assert.equal(NODE_TYPES.world_assembly.inputs.legacyWorld.internal, true);
  assert.equal(NODE_TYPES.world_assembly.inputs.legacyWorld.deprecated, true);
});

test("all node data types have visually distinct colors", function () {
  const seen = new Map();
  for (const [dataType, color] of Object.entries(DATA_TYPE_COLORS)) {
    assert.match(color, /^#[0-9a-f]{6}$/i);
    assert.equal(seen.has(color), false, `${dataType} duplicates ${seen.get(color)} with ${color}`);
    seen.set(color, dataType);
  }
});
