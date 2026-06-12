import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { authorizeRequest } from "../apps/api-server/src/auth-routes.ts";
import {
  createEditorProceduralBakeDraftResponse,
  createEditorProceduralPreviewResponse,
  createEditorProceduralValidationResponse
} from "../apps/api-server/src/editor-procedural-routes.ts";
import { createProceduralGenerationPanelState } from "../apps/editor-web/src/panels.ts";
import { createRoleMappingForAssetType } from "../packages/asset-library/src/index.ts";
import { createDeterministicSequence } from "../packages/node-engine/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createEmptyGenerationOutput,
  createEntityComponentDraft,
  createEntityTemplateDraft,
  createProceduralGeneratorNodeDraft,
  createProceduralGraphDraft,
  validateProceduralGenerationOutput,
  validateProceduralGraphDraft
} from "../packages/schemas/src/index.ts";

const editorSession = {
  scope: "editor",
  editorRoles: []
};

const gameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

function proceduralGraph(seed = "phase-8-1-seed") {
  return createProceduralGraphDraft({
    graphId: "phase8-1-procedural-test",
    seed: { scope: "world", seed },
    nodes: [
      createProceduralGeneratorNodeDraft({
        nodeId: "seed-node",
        nodeType: "proc.seed",
        config: { scope: "world", seed }
      }),
      createProceduralGeneratorNodeDraft({
        nodeId: "scatter-node",
        nodeType: "proc.scatterAssets",
        config: { placementRuleKey: "editor-data-rule-key" },
        inputRefs: { asset: { source: "asset-library", assetId: "glb-candidate" } }
      })
    ]
  });
}

function glbRecord(assetId) {
  return {
    assetId,
    assetType: "glb",
    status: "active",
    roleMapping: createRoleMappingForAssetType("glb")
  };
}

describe("Fase 8.1 procedural generation core", () => {
  it("requires an explicit seed for procedural graphs", () => {
    const graph = createProceduralGraphDraft({ graphId: "missing-seed-test" });
    const issues = validateProceduralGraphDraft(graph);
    const response = createEditorProceduralValidationResponse(graph);

    assert.equal(issues.some((issue) => issue.path === "seed" && issue.severity === "error"), true);
    assert.equal(response.validForPreview, false);
    assert.equal(response.validForBakeDraft, false);
    assert.equal(response.publishesRuntimeOutput, false);
  });

  it("uses deterministic random streams for same seed, graph and inputs", () => {
    const first = createEditorProceduralPreviewResponse(proceduralGraph("same-seed"));
    const second = createEditorProceduralPreviewResponse(proceduralGraph("same-seed"));
    const different = createEditorProceduralPreviewResponse(proceduralGraph("different-seed"));
    const firstSequence = createDeterministicSequence({ seed: "same-seed", count: 4, streamKey: "sequence-test" });
    const secondSequence = createDeterministicSequence({ seed: "same-seed", count: 4, streamKey: "sequence-test" });

    assert.deepEqual(first.preview.output, second.preview.output);
    assert.equal(first.deterministicSignature, second.deterministicSignature);
    assert.notEqual(first.deterministicSignature, different.deterministicSignature);
    assert.deepEqual(firstSequence, secondSequence);
  });

  it("defines procedural node types on Fase 6 typed sockets", () => {
    const nodeTypes = getCoreGraphNodeTypes();
    const expectedTypes = [
      "gk.proc.seed",
      "gk.proc.random",
      "gk.proc.pickWeighted",
      "gk.proc.noise2D",
      "gk.proc.noise3D",
      "gk.proc.scatterAssets",
      "gk.proc.scatterEntities",
      "gk.proc.zoneLayout",
      "gk.proc.pathNetwork",
      "gk.proc.spawnArea",
      "gk.proc.resourceDistribution",
      "gk.proc.validateGeneratedGraph",
      "gk.proc.previewGeneration",
      "gk.proc.bakeGenerationDraft"
    ];

    for (const type of expectedTypes) {
      assert.ok(nodeTypes.find((definition) => definition.type === type), type);
    }

    const scatterAssets = nodeTypes.find((definition) => definition.type === "gk.proc.scatterAssets");
    const bakeDraft = nodeTypes.find((definition) => definition.type === "gk.proc.bakeGenerationDraft");

    assert.equal(scatterAssets?.createsConcreteGameContent, false);
    assert.equal(scatterAssets?.sockets.some((socket) => socket.valueType === "asset.reference"), true);
    assert.equal(scatterAssets?.sockets.some((socket) => socket.valueType === "generated.placement.candidate.reference"), true);
    assert.equal(bakeDraft?.createsConcreteGameContent, false);
    assert.equal(bakeDraft?.sockets.some((socket) => socket.valueType === "generation.output.reference"), true);
  });

  it("keeps preview and bake output draft-only", () => {
    const preview = createEditorProceduralPreviewResponse(proceduralGraph("draft-only-seed"));
    const bake = createEditorProceduralBakeDraftResponse(proceduralGraph("draft-only-seed"));
    const panel = createProceduralGenerationPanelState({ previewResult: preview.preview, bakeDraftResult: bake.bakeDraft });

    assert.equal(preview.preview.mode, "procedural-preview");
    assert.equal(preview.preview.publishesRuntimeOutput, false);
    assert.equal(preview.preview.output.publishesRuntimeOutput, false);
    assert.equal(bake.bakeDraft.mode, "procedural-bake-draft");
    assert.equal(bake.writesEditorDraftData, true);
    assert.equal(bake.bakeDraft.publishesRuntimeOutput, false);
    assert.equal(panel.noRuntimePublishBadge, true);
    assert.deepEqual(panel.inventedContent, []);
  });

  it("validates generated entities through Fase 8 entity/component contracts", () => {
    const graph = proceduralGraph("entity-contract-seed");
    const assetReference = { source: "asset-library", assetId: "glb-candidate" };
    const output = {
      ...createEmptyGenerationOutput({ graph, deterministicSignature: "entity-contract" }),
      generatedEntities: [{
        generatedId: "generated-entity-candidate",
        sourceNodeId: "scatter-node",
        entityDraft: createEntityTemplateDraft({
          entityId: "generated-entity-candidate",
          assetReference,
          components: [
            createEntityComponentDraft("renderable", { assetReference }),
            createEntityComponentDraft("npc_brain")
          ]
        }),
        status: "candidate",
        publishesRuntimeOutput: false
      }]
    };
    const issues = validateProceduralGenerationOutput(output, { assetRecords: [glbRecord("glb-candidate")] });

    assert.equal(issues.some((issue) => issue.message.includes("Missing animation mapping") && issue.severity === "warning"), true);
    assert.equal(issues.some((issue) => issue.severity === "error"), false);
    assert.equal(output.generatedEntities[0].entityDraft.publishesRuntimeOutput, false);
  });

  it("keeps generated audio gated when audio count is 0", () => {
    const graph = proceduralGraph("audio-gate-seed");
    const output = {
      ...createEmptyGenerationOutput({ graph, deterministicSignature: "audio-gate" }),
      audioCandidates: [{
        candidateId: "audio-candidate",
        sourceNodeId: "audio-node",
        audioReference: null,
        status: "candidate",
        publishesRuntimeOutput: false
      }]
    };
    const issues = validateProceduralGenerationOutput(output, { audioCount: 0 });

    assert.equal(issues.some((issue) => issue.message.includes("audio asset count is 0") && issue.severity === "warning"), true);
    assert.equal(issues.some((issue) => issue.blocksRuntimePublish), false);
  });

  it("reports missing generated asset references as validation issues", () => {
    const graph = proceduralGraph("missing-asset-seed");
    const output = {
      ...createEmptyGenerationOutput({ graph, deterministicSignature: "missing-asset" }),
      placementCandidates: [{
        candidateId: "placement-candidate",
        sourceNodeId: "scatter-node",
        assetReference: { source: "asset-library", assetId: "missing-glb" },
        entityReference: null,
        transform: {},
        status: "candidate",
        publishesRuntimeOutput: false
      }]
    };
    const issues = validateProceduralGenerationOutput(output, { assetRecords: [] });

    assert.equal(issues.some((issue) => issue.path.includes("assetReference") && issue.severity === "error"), true);
  });

  it("keeps procedural editor management editor-only", () => {
    assert.deepEqual(authorizeRequest("editor.procedural.graph", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.procedural.validate", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.procedural.preview", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.procedural.bake_draft", editorSession), { allowed: true });
    assert.equal(authorizeRequest("editor.procedural.generated", gameSession).reason, "wrong_scope");
    assert.equal(authorizeRequest("editor.procedural.issues", null).reason, "missing_session");
  });

  it("does not use implicit randomness, dummy assets, secrets, asset copy or runtime publish", () => {
    const checkedFiles = [
      "packages/schemas/src/procedural-generation.ts",
      "packages/schemas/src/procedural-validation.ts",
      "packages/node-engine/src/deterministic-random.ts",
      "packages/node-types/src/procedural-generation-nodes.ts",
      "apps/api-server/src/editor-procedural-routes.ts",
      "apps/editor-web/src/panels.ts",
      "db/migrations/0005_procedural_generation_core.sql"
    ];
    const combined = checkedFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(combined, /Math\.random\s*\(/);
    assert.doesNotMatch(combined, /new Date\s*\(|Date\.now\s*\(/);
    assert.doesNotMatch(combined, /dummy asset|fake asset|dummy audio|fake audio|dummy npc|fake npc|hardcoded village|loot table|boss route/i);
    assert.doesNotMatch(combined, /BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_|sk-[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(combined, /publishesRuntimeOutput:\s*true|publishes_runtime_output\s+TINYINT\(1\)\s+NOT NULL\s+DEFAULT\s+1/);
    assert.doesNotMatch(combined, /assetsCopiedToGit:\s*true|assets_copied_to_git\s+TINYINT\(1\)\s+NOT NULL\s+DEFAULT\s+1/);
    assert.doesNotMatch(readFileSync("db/migrations/0005_procedural_generation_core.sql", "utf8"), /INSERT\s+INTO/i);
  });
});
