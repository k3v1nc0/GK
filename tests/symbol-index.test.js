import assert from "node:assert/strict";
import test from "node:test";
import { SymbolIndexService, buildSymbolIndex } from "../src/server/symbol-index-service.js";
import { foundationGraph } from "./fixtures.js";

test("symbol index resolves aliases and reference kinds", function () {
  const graph = foundationGraph();
  const index = buildSymbolIndex(graph);
  const service = new SymbolIndexService();

  assert.equal(index.byId.get("global.game_name").kind, "globalValue");
  assert.equal(index.aliases.get("global.legacy_game_name"), "global.game_name");

  const search = service.search(graph, { q: "game", limit: 5 });
  assert.ok(search.symbols.some(function (symbol) { return symbol.id === "global.game_name"; }));

  const validated = service.validateReferences(graph, [
    {
      id: "global.legacy_game_name",
      expectedKinds: ["global"],
      nodeId: "node_project",
      field: "startZoneRef"
    }
  ]);
  assert.equal(validated.errors.length, 0);
  assert.equal(validated.validated.length, 1);

  const wrongKind = service.validateReferences(graph, [
    {
      id: "global.game_name",
      expectedKinds: ["tag"],
      nodeId: "node_project",
      field: "startZoneRef"
    }
  ]);
  assert.equal(wrongKind.errors[0].code, "REFERENCE_WRONG_KIND");
});
