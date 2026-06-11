import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  createAssetPollingWatcherContract,
  createEmptyAssetLibrarySnapshot,
  createRoleMappingForAssetType,
  scanAssetSourceDirectory
} from "../packages/asset-library/src/index.ts";
import { authorizeRequest } from "../apps/api-server/src/auth-routes.ts";
import {
  createAssetPanelState,
  createAudioPanelState
} from "../apps/editor-web/src/panels.ts";

const editorSession = {
  scope: "editor",
  editorRoles: []
};

const gameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

function minimalGlbBuffer() {
  const buffer = Buffer.alloc(12);
  buffer.write("glTF", 0, "utf8");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(12, 8);
  return buffer;
}

describe("Fase 7 asset scanner core", () => {
  it("scans GLB metadata and preserves filenames with spaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "gk-phase7-assets-"));

    try {
      await writeFile(join(root, "asset with space.glb"), minimalGlbBuffer());

      const library = await scanAssetSourceDirectory({
        sourceDir: root,
        now: new Date("2026-06-11T18:00:00Z")
      });
      const [asset] = library.records;

      assert.equal(library.counts.glb, 1);
      assert.equal(library.counts.uiImage, 0);
      assert.equal(library.counts.audio, 0);
      assert.equal(asset.originalFilename, "asset with space.glb");
      assert.equal(asset.relativePath, "asset with space.glb");
      assert.equal(asset.normalizedKey, "asset-with-space");
      assert.equal(asset.extension, ".glb");
      assert.equal(asset.status, "active");
      assert.equal(asset.metadata.format, "glb");
      assert.equal(asset.metadata.glbVersion, 2);
      assert.equal(asset.contentHash?.algorithm, "sha256");
      assert.match(asset.contentHash?.value ?? "", /^[0-9a-f]{64}$/);
      assert.equal(asset.roleMapping.status, "candidate");
      assert.equal(asset.roleMapping.assignedRole, null);
      assert.equal(library.publishesRuntimeOutput, false);
      assert.equal(library.assetsCopiedToGit, false);
      assert.equal(library.assignsDefinitiveRuntimeRoles, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps UI and audio count 0 valid without dummy assets", () => {
    const library = createEmptyAssetLibrarySnapshot("/server/assets", new Date("2026-06-11T18:00:00Z"));
    const audioPanel = createAudioPanelState(library);

    assert.equal(library.counts.uiImage, 0);
    assert.equal(library.counts.audio, 0);
    assert.deepEqual(library.records, []);
    assert.equal(audioPanel.audioPickerEnabled, false);
    assert.deepEqual(audioPanel.audioAssets, []);
    assert.deepEqual(audioPanel.inventedAudio, []);
  });

  it("marks disappeared assets as missing instead of deleting the record", async () => {
    const root = await mkdtemp(join(tmpdir(), "gk-phase7-missing-"));
    const assetPath = join(root, "nested", "removed.glb");

    try {
      await mkdir(join(root, "nested"));
      await writeFile(assetPath, minimalGlbBuffer());
      const firstScan = await scanAssetSourceDirectory({ sourceDir: root });

      await rm(assetPath);
      const secondScan = await scanAssetSourceDirectory({
        sourceDir: root,
        previousRecords: firstScan.records
      });

      assert.equal(secondScan.records.length, 1);
      assert.equal(secondScan.records[0].status, "missing");
      assert.equal(secondScan.counts.missing, 1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps role mapping unassigned or candidate until editor data assigns a role", () => {
    const glbMapping = createRoleMappingForAssetType("glb");
    const audioMapping = createRoleMappingForAssetType("audio");

    assert.equal(glbMapping.status, "candidate");
    assert.equal(glbMapping.assignedRole, null);
    assert.equal(glbMapping.source, "scanner-candidate");
    assert.equal(audioMapping.status, "unassigned");
    assert.equal(audioMapping.assignedRole, null);
    assert.doesNotMatch(JSON.stringify(glbMapping), /"assignedRole":"(object|npc|prop|environment|boss|player)"/i);
  });

  it("keeps editor asset management routes editor-only", () => {
    assert.deepEqual(authorizeRequest("editor.asset_library.read", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.asset_library.scan", editorSession), { allowed: true });
    assert.deepEqual(authorizeRequest("editor.asset_library.read", gameSession), { allowed: false, reason: "wrong_scope" });
    assert.deepEqual(authorizeRequest("editor.asset_library.scan", null), { allowed: false, reason: "missing_session" });
  });

  it("keeps asset and audio pickers on Fase 6 typed sockets", () => {
    const nodeTypes = readFileSync("packages/node-types/src/index.ts", "utf8");

    assert.match(nodeTypes, /valueType: "asset\.reference"/);
    assert.match(nodeTypes, /kind: "asset-picker"/);
    assert.match(nodeTypes, /valueType: "audio\.reference"/);
    assert.match(nodeTypes, /kind: "audio-picker"/);
  });

  it("shows library state and role mapping status without assigning runtime roles", () => {
    const library = createEmptyAssetLibrarySnapshot("/server/assets", new Date("2026-06-11T18:00:00Z"));
    const assetPanel = createAssetPanelState(library);

    assert.equal(assetPanel.inventory?.totalCount, 0);
    assert.equal(assetPanel.roleMapping.displaysStatus, true);
    assert.equal(assetPanel.roleMapping.editsAsEditorData, true);
    assert.equal(assetPanel.roleMapping.assignsDefinitiveRuntimeRoles, false);
    assert.equal(assetPanel.assignsRuntimeRoles, false);
    assert.deepEqual(assetPanel.inventedAssets, []);
  });

  it("keeps watcher/polling as a contract and never publishes from scan", () => {
    const contract = createAssetPollingWatcherContract("/server/assets", 10_000);

    assert.equal(contract.mode, "polling-or-watch");
    assert.equal(contract.defaultPollingIntervalMs, 10_000);
    assert.equal(contract.startsPermanentDaemonFromGit, false);
    assert.equal(contract.deletesServerFiles, false);
    assert.equal(contract.publishesRuntimeOutput, false);
  });

  it("does not add repo assets, dummy assets or hard-coded server asset names in Fase 7 source", () => {
    const checkedFiles = [
      "packages/asset-library/src/contracts.ts",
      "packages/asset-library/src/scanner.ts",
      "apps/api-server/src/editor-asset-library-routes.ts",
      "apps/asset-worker/src/index.ts",
      "apps/editor-web/src/panels.ts"
    ];
    const combined = checkedFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    assert.equal(existsSync("assets/asset with space.glb"), false);
    assert.doesNotMatch(combined, /Blacksmit|Taverne|Wizard/);
    assert.doesNotMatch(combined, /dummy asset|fake asset|dummy audio|fake audio|dummy glb|fake glb/i);
    assert.doesNotMatch(combined, /publishesRuntimeOutput:\s*true/);
  });
});
