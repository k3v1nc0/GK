import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { authorizeRequest } from "../apps/api-server/src/auth-routes.ts";
import {
  createEditorAssetEntityMappingResponse,
  createEditorEntityValidationResponse
} from "../apps/api-server/src/editor-entity-routes.ts";
import { createEntityComponentPanelState } from "../apps/editor-web/src/panels.ts";
import {
  countAssetRecords,
  createEmptyAssetLibrarySnapshot,
  createRoleMappingForAssetType
} from "../packages/asset-library/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createAssetToEntityRoleMappingDraft,
  createEntityComponentDraft,
  createEntityTemplateDraft,
  validateEntityComponentDraft,
  validateEntityTemplateDraft
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

const vector = { x: 0, y: 0, z: 0 };
const scale = { x: 1, y: 1, z: 1 };

function glbRecord(assetId, originalFilename) {
  return {
    assetId,
    assetType: "glb",
    originalFilename,
    normalizedKey: assetId,
    relativePath: originalFilename,
    extension: ".glb",
    sizeBytes: 1024,
    modifiedAt: new Date("2026-06-12T07:00:00Z").toISOString(),
    contentHash: null,
    metadata: {},
    status: "active",
    roleMapping: createRoleMappingForAssetType("glb")
  };
}

function transformComponent() {
  return createEntityComponentDraft("transform", {
    position: vector,
    rotation: vector,
    scale
  });
}

function renderableComponent(assetId) {
  return createEntityComponentDraft("renderable", {
    assetReference: { source: "asset-library", assetId }
  });
}

describe("Fase 8 entity/component core", () => {
  it("allows the same GLB to be object-candidate and NPC-candidate via data/components", () => {
    const records = [glbRecord("taverne", "Taverne.glb")];
    const assetReference = { source: "asset-library", assetId: "taverne" };
    const objectCandidate = createEntityTemplateDraft({
      entityId: "phase8-object-test",
      assetReference,
      components: [transformComponent(), renderableComponent("taverne")]
    });
    const npcCandidate = createEntityTemplateDraft({
      entityId: "phase8-npc-test",
      assetReference,
      components: [renderableComponent("taverne"), createEntityComponentDraft("npc_brain")]
    });

    const objectIssues = validateEntityTemplateDraft(objectCandidate, { assetRecords: records });
    const npcIssues = validateEntityTemplateDraft(npcCandidate, { assetRecords: records });

    assert.equal(objectIssues.some((issue) => issue.severity === "error"), false);
    assert.equal(npcIssues.some((issue) => issue.message.includes("Missing animation mapping")), true);
    assert.equal(npcIssues.some((issue) => issue.severity === "error"), false);
    assert.equal(objectCandidate.publishesRuntimeOutput, false);
    assert.equal(npcCandidate.publishesRuntimeOutput, false);
  });

  it("keeps Taverne and Wizard as Kevin test input, not runtime hardcode", () => {
    const mapping = createAssetToEntityRoleMappingDraft({ source: "asset-library", assetId: "wizard" });

    assert.equal(mapping.mappingStatus, "candidate");
    assert.deepEqual(mapping.assignedComponents, []);
    assert.equal(mapping.assignsDefinitiveRuntimeRole, false);
    assert.equal(mapping.publishesRuntimeOutput, false);

    const runtimeSource = [
      "packages/schemas/src/entity-components.ts",
      "packages/schemas/src/entity-validation.ts",
      "packages/node-types/src/entity-component-nodes.ts",
      "apps/api-server/src/editor-entity-routes.ts",
      "apps/editor-web/src/panels.ts"
    ].map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(runtimeSource, /Taverne\.glb|Wizard\.glb/);
  });

  it("warns for missing animation mapping on candidate entities without blocking candidate status", () => {
    const issues = validateEntityComponentDraft(createEntityComponentDraft("npc_brain"));

    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].blocksRuntimeActivation, false);
  });

  it("requires explicit animation mapping for runtime-active NPC/combat/player behavior", () => {
    const activeWithoutAnimation = createEntityComponentDraft("combatant", {}, {
      runtimeActive: true,
      editorDataConfirmed: true
    });
    const activeWithAnimation = createEntityComponentDraft("combatant", {}, {
      runtimeActive: true,
      editorDataConfirmed: true,
      animationMapping: { source: "editor-data", clips: { idle: "clip-id" } }
    });

    assert.equal(validateEntityComponentDraft(activeWithoutAnimation).some((issue) => issue.blocksRuntimeActivation), true);
    assert.equal(validateEntityComponentDraft(activeWithAnimation).some((issue) => issue.severity === "error"), false);
  });

  it("keeps audio emitter gated when audio count is 0", () => {
    const issues = validateEntityComponentDraft(createEntityComponentDraft("audio_emitter"), { audioCount: 0 });
    const library = createEmptyAssetLibrarySnapshot("/var/www/gk/assets");
    const panel = createEntityComponentPanelState(library);

    assert.equal(issues[0].severity, "warning");
    assert.equal(issues[0].blocksRuntimeActivation, false);
    assert.equal(panel.audioEmitterGate.audioAssetCount, 0);
    assert.equal(panel.audioEmitterGate.audioPickerEnabled, false);
  });

  it("defines entity/component node types on Fase 6 typed sockets", () => {
    const nodeTypes = getCoreGraphNodeTypes();
    const spawn = nodeTypes.find((definition) => definition.type === "gk.entity.spawnFromAsset");
    const npc = nodeTypes.find((definition) => definition.type === "gk.npc.makeFromAsset");

    assert.ok(spawn);
    assert.ok(npc);
    assert.equal(spawn.createsConcreteGameContent, false);
    assert.equal(npc.createsConcreteGameContent, false);
    assert.equal(spawn.sockets.some((socket) => socket.valueType === "asset.reference"), true);
    assert.equal(npc.sockets.some((socket) => socket.valueType === "asset.reference"), true);
  });

  it("prepares groupTransform contract without publishing runtime output", () => {
    const groupTransform = getCoreGraphNodeTypes().find((definition) => definition.type === "gk.entity.groupTransform");

    assert.ok(groupTransform);
    assert.equal(groupTransform.sockets.some((socket) => socket.valueType === "entity.group.reference"), true);
    assert.equal(groupTransform.fields.some((field) => field.id === "positionX"), true);
    assert.equal(groupTransform.createsConcreteGameContent, false);
  });

  it("keeps editor entity management editor-only", () => {
    assert.deepEqual(authorizeRequest("editor.entity.draft", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.entity.validate", editorSession), { allowed: true });
    assert.equal(authorizeRequest("editor.entity.asset_mappings.update", gameSession).reason, "wrong_scope");
    assert.equal(authorizeRequest("editor.entity.groups", null).reason, "missing_session");
  });

  it("validates component drafts and never publishes from Fase 8 APIs", () => {
    const response = createEditorEntityValidationResponse(createEntityTemplateDraft({
      entityId: "phase8-validation-test",
      components: [renderableComponent("wizard")]
    }), { assetRecords: [glbRecord("wizard", "Wizard.glb")] });
    const mappingResponse = createEditorAssetEntityMappingResponse([glbRecord("wizard", "Wizard.glb")]);

    assert.equal(response.ok, true);
    assert.equal(response.validForCandidate, true);
    assert.equal(response.publishesRuntimeOutput, false);
    assert.equal(mappingResponse.mappings[0].mappingStatus, "candidate");
    assert.equal(mappingResponse.publishesRuntimeOutput, false);
  });

  it("does not add dummy assets, gamecontent, secrets or runtime publish flags", () => {
    const checkedFiles = [
      "packages/schemas/src/entity-components.ts",
      "packages/schemas/src/entity-validation.ts",
      "packages/node-types/src/entity-component-nodes.ts",
      "apps/api-server/src/editor-entity-routes.ts",
      "apps/editor-web/src/panels.ts",
      "db/migrations/0004_entity_component_core.sql"
    ];
    const combined = checkedFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(combined, /dummy asset|fake asset|dummy glb|fake glb|dummy npc|fake npc/i);
    assert.doesNotMatch(combined, /BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_|sk-[A-Za-z0-9]{20,}/);
    assert.doesNotMatch(combined, /publishesRuntimeOutput:\s*true|publishes_runtime_output\s+TINYINT\(1\)\s+NOT NULL\s+DEFAULT\s+1/);
  });
});
