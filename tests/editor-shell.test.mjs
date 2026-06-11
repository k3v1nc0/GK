import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { authorizeRequest } from "../apps/api-server/src/auth-routes.ts";
import {
  canOpenGameUserManagementPanel,
  gameUserManagementPanelContract
} from "../apps/editor-web/src/game-user-management.ts";
import { createEmptyNodeCanvasState } from "../apps/editor-web/src/node-canvas.ts";
import {
  createAssetPanelState,
  createAudioPanelState,
  EDITOR_PANEL_DEFINITIONS
} from "../apps/editor-web/src/panels.ts";
import { createEmptyWorldPreviewState } from "../apps/editor-web/src/world-preview.ts";

const editorAdminSession = {
  scope: "editor",
  editorRoles: ["editor_admin"]
};

const editorUserSession = {
  scope: "editor",
  editorRoles: []
};

const gameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

describe("Fase 5 editor shell layout", () => {
  it("keeps Node Canvas and Viewport / World Preview as separate main tabs", () => {
    const shellSource = readFileSync("apps/editor-web/src/editor-shell.ts", "utf8");

    assert.match(shellSource, /mainTabs: \["node-canvas", "viewport-world-preview"\]/);
    assert.match(shellSource, /title: "Node Canvas"/);
    assert.match(shellSource, /title: "Viewport \/ World Preview"/);
    assert.doesNotMatch(shellSource, /mainTabs: \["viewport-world-preview", "node-canvas"\]/);
  });

  it("places the required panels in stable editor regions", () => {
    const shellSource = readFileSync("apps/editor-web/src/editor-shell.ts", "utf8");

    assert.match(shellSource, /left: \["node-library"\]/);
    assert.match(shellSource, /right: \["inspector", "validation"\]/);
    assert.match(shellSource, /bottom: \["history"\]/);
    assert.match(shellSource, /dockTabs: \["asset-panel", "audio-panel", "hud-editor", "minimap-panel", "game-users"\]/);
  });

  it("starts the node canvas empty with generic capability definitions", () => {
    const canvas = createEmptyNodeCanvasState();

    assert.equal(canvas.id, "node-canvas");
    assert.deepEqual(canvas.graph.nodes, []);
    assert.deepEqual(canvas.graph.edges, []);
    assert.equal(canvas.grid.enabled, true);
    assert.equal(canvas.historyDepth, 100);
    assert.equal(canvas.capabilityDefinitions.every((definition) => definition.createsConcreteGameContent === false), true);
  });

  it("exposes all Fase 5 panels as generic capabilities", () => {
    const panelIds = EDITOR_PANEL_DEFINITIONS.map((panel) => panel.id).sort();

    assert.deepEqual(panelIds, [
      "asset-panel",
      "audio-panel",
      "game-users",
      "history",
      "hud-editor",
      "inspector",
      "minimap-panel",
      "node-library",
      "validation"
    ]);
    assert.equal(EDITOR_PANEL_DEFINITIONS.every((panel) => panel.acceptsConcreteGameContent === false), true);
  });
});

describe("Fase 5 empty viewport and asset/audio gates", () => {
  it("keeps the world preview empty until published world-node data exists", () => {
    const viewport = createEmptyWorldPreviewState();

    assert.equal(viewport.status, "empty");
    assert.equal(viewport.message, "Empty world preview");
    assert.deepEqual(viewport.worldObjects, []);
    assert.deepEqual(viewport.assetReferences, []);
    assert.deepEqual(viewport.audioReferences, []);
    assert.equal(viewport.camera, null);
    assert.equal(viewport.lighting, null);
    assert.equal(viewport.acceptsDummyContent, false);
  });

  it("keeps asset and audio panels from inventing assets or roles", () => {
    const inventory = {
      glbCount: 4,
      uiImageCount: 0,
      audioCount: 0,
      source: "server-scan"
    };
    const assetPanel = createAssetPanelState(inventory);
    const audioPanel = createAudioPanelState(inventory);

    assert.equal(assetPanel.assignsRuntimeRoles, false);
    assert.deepEqual(assetPanel.inventedAssets, []);
    assert.equal(audioPanel.gateOpenWhenAudioCountIsZero, true);
    assert.deepEqual(audioPanel.inventedAudio, []);
    assert.equal(audioPanel.inventory?.audioCount, 0);
  });
});

describe("Fase 5 game-user management access", () => {
  it("requires editor_admin for the Game Users panel", () => {
    assert.equal(canOpenGameUserManagementPanel(editorAdminSession), true);
    assert.equal(canOpenGameUserManagementPanel(editorUserSession), false);
    assert.equal(canOpenGameUserManagementPanel(gameSession), false);
    assert.equal(gameUserManagementPanelContract.requiresScope, "editor");
    assert.equal(gameUserManagementPanelContract.requiresRole, "editor_admin");
  });

  it("uses API route contracts that reject game sessions", () => {
    assert.deepEqual(authorizeRequest("editor.game_users.list", editorAdminSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.game_users.status_update", editorAdminSession), { allowed: true });
    assert.equal(authorizeRequest("editor.game_users.list", editorUserSession).reason, "missing_role");
    assert.equal(authorizeRequest("editor.game_users.status_update", gameSession).reason, "wrong_scope");
  });
});

describe("Fase 5 repository safety", () => {
  it("does not add secrets or concrete gamecontent to editor shell files", () => {
    const files = [
      "apps/editor-web/src/editor-shell.ts",
      "apps/editor-web/src/node-canvas.ts",
      "apps/editor-web/src/world-preview.ts",
      "apps/editor-web/src/panels.ts",
      "apps/editor-web/src/game-user-management.ts",
      "docs/architecture/editor-shell.md"
    ];
    const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");

    assert.doesNotMatch(combined, /BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}|gh[pousr]_|sk-[A-Za-z0-9]{20,}/);
  });
});
