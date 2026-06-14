import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  RUNTIME_RENDER_LIFECYCLE_STATES,
  RUNTIME_RENDER_SURFACE_MARKER,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeRenderSurfaceSafetyFlags,
  createRuntimeRenderSurfaceState,
  validateRuntimeRenderSurfaceRoutes,
  validateRuntimeRenderSurfaceState
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  createRuntimeRenderSurfaceShellState,
  renderRuntimeRenderSurfaceSection,
  runtimeRenderSurfaceClientContract
} from "../apps/game-web/src/runtime-render-surface.ts";
import { renderRuntimeClientShellHtml } from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN = /Quest 00|Humble Ash Staff|Spark|Empathy Casting|Mentor failure|The Candle|Fixture Quest Title|Fixture Reward Name|Fixture Unlock Name|Fixture Dialogue Line/i;
const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 13 schema package exports runtime render surface contracts from real modules", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-render-surface"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-render-surface-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-render-surface-core"), false);
  assert.deepEqual([...RUNTIME_RENDER_LIFECYCLE_STATES], ["booting", "empty", "ready", "error"]);
});

test("Fase 13 runtime render sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.render.surface.reference",
    "runtime.render.status.reference",
    "runtime.render.capability.reference",
    "runtime.render.lifecycle.reference",
    "runtime.render.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeRender.surface",
    "gk.runtimeRender.status",
    "gk.runtimeRender.capability",
    "gk.runtimeRender.lifecycle",
    "gk.runtimeRender.safetyFlags"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeRenderNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeRender."));
  assert.equal(runtimeRenderNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeRenderNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeRenderNodes.every((node) => node.validate.validate({ loadsAssets: true }).length > 0), true);
  assert.equal(runtimeRenderNodes.every((node) => node.validate.validate({ implementsGameplay: true }).length > 0), true);
});

test("runtime render surface contracts validate safe empty render state", () => {
  const state = createRuntimeRenderSurfaceState();
  const validation = validateRuntimeRenderSurfaceState(state);

  assert.equal(validation.valid, true);
  assert.equal(state.phase, RUNTIME_RENDER_SURFACE_MARKER);
  assert.equal(state.lifecycle, "empty");
  assert.equal(state.safeEmptyState, true);
  assert.deepEqual(state.projectionRoutes, RUNTIME_CLIENT_PROJECTION_READ_ROUTES);
  assert.equal(state.safetyFlags.createsRenderSurface, true);
  assert.equal(state.safetyFlags.consumesRuntimeProjectionMetadata, true);
  assert.equal(state.safetyFlags.loadsAssets, false);
  assert.equal(state.safetyFlags.rendersConcreteWorld, false);
  assert.equal(state.safetyFlags.implementsGameplay, false);
  assert.equal(state.safetyFlags.implementsMovement, false);
  assert.equal(state.safetyFlags.implementsCombat, false);
  assert.equal(state.safetyFlags.implementsAudioPlayback, false);
  assert.equal(state.safetyFlags.hardcodesCamera, false);
  assert.equal(state.safetyFlags.hardcodesLighting, false);
  assert.equal(state.safetyFlags.hardcodesHud, false);
  assert.equal(state.safetyFlags.hardcodesMinimap, false);
  assert.equal(state.safetyFlags.hardcodesContent, false);
  assert.equal(state.safetyFlags.mutatesAssets, false);
  assert.equal(state.safetyFlags.usesEditorDraftData, false);
});

test("runtime render validation rejects editor routes, draft data, asset loads and concrete content", () => {
  const unsafeState = createRuntimeRenderSurfaceState({
    projectionRoutes: ["/editor/runtime-projection/status"],
    projectionEmptyState: false,
    lifecycle: "ready",
    safetyFlags: createRuntimeRenderSurfaceSafetyFlags({
      usesEditorAdminRoutes: true,
      usesEditorDraftData: true,
      loadsAssets: true,
      assetLoadUrls: true,
      rendersConcreteWorld: true,
      assemblesScene: true,
      implementsGameplay: true,
      implementsMovement: true,
      implementsCombat: true,
      implementsAudioPlayback: true,
      hardcodesCamera: true,
      hardcodesLighting: true,
      hardcodesHud: true,
      hardcodesMinimap: true,
      hardcodesContent: true,
      mutatesAssets: true
    }),
    assetLoadUrls: ["/assets/characters/forbidden.glb"],
    concreteContentIndicators: ["npc-payload"],
    hardcodedRuntimeValueIndicators: ["camera-position"]
  });
  const validation = validateRuntimeRenderSurfaceState(unsafeState);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-admin-routes"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-draft-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-loads"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-concrete-world-payload"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-runtime-values"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-gameplay-audio"), true);
  assert.equal(validateRuntimeRenderSurfaceRoutes(["/runtime/projection/status"]).length, 0);
  assert.equal(validateRuntimeRenderSurfaceRoutes(["/assets/world.glb"]).some((issue) => issue.gate === "no-asset-loads"), true);
});

test("game shell renders runtime render surface marker and safe empty host", () => {
  const html = renderRuntimeClientShellHtml();
  const section = renderRuntimeRenderSurfaceSection(createRuntimeRenderSurfaceShellState());

  for (const output of [html, section]) {
    assert.match(output, /data-runtime-render-surface="phase-13"/);
    assert.match(output, /data-runtime-render-canvas/);
    assert.match(output, /data-runtime-render-safe-empty-state/);
    assert.match(output, /No renderable projection payload available/);
    assert.doesNotMatch(output, /\/editor\//);
    assert.doesNotMatch(output, /\/auth\/editor/);
    assert.doesNotMatch(output, /\/assets\//);
    assert.doesNotMatch(output, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
  }

  assert.doesNotMatch(section, /dummy|NPC|quest|economy|loot/i);
  assert.doesNotMatch(html, /dummy|NPC|economy|loot/i);
  assert.doesNotMatch(html, FORBIDDEN_CONCRETE_QUEST_CONTENT_PATTERN);
});

test("runtime render surface client contract stays metadata-only and contentless", () => {
  assert.deepEqual(runtimeRenderSurfaceClientContract.projectionRoutes, RUNTIME_CLIENT_PROJECTION_READ_ROUTES);
  assert.equal(runtimeRenderSurfaceClientContract.method, "GET");
  assert.equal(runtimeRenderSurfaceClientContract.credentials, "omit");
  assert.equal(runtimeRenderSurfaceClientContract.createsRenderSurface, true);
  assert.equal(runtimeRenderSurfaceClientContract.consumesRuntimeProjectionMetadata, true);
  assert.equal(runtimeRenderSurfaceClientContract.loadsAssets, false);
  assert.equal(runtimeRenderSurfaceClientContract.rendersConcreteWorld, false);
  assert.equal(runtimeRenderSurfaceClientContract.implementsGameplay, false);
  assert.equal(runtimeRenderSurfaceClientContract.implementsMovement, false);
  assert.equal(runtimeRenderSurfaceClientContract.implementsCombat, false);
  assert.equal(runtimeRenderSurfaceClientContract.implementsAudioPlayback, false);
  assert.equal(runtimeRenderSurfaceClientContract.hardcodesCamera, false);
  assert.equal(runtimeRenderSurfaceClientContract.hardcodesLighting, false);
  assert.equal(runtimeRenderSurfaceClientContract.hardcodesHud, false);
  assert.equal(runtimeRenderSurfaceClientContract.hardcodesMinimap, false);
  assert.equal(runtimeRenderSurfaceClientContract.hardcodesContent, false);
  assert.equal(runtimeRenderSurfaceClientContract.mutatesAssets, false);
  assert.equal(runtimeRenderSurfaceClientContract.usesEditorDraftData, false);
  assert.equal(runtimeRenderSurfaceClientContract.usesEditorAdminRoutes, false);
});

test("game web routes expose phase 13 render surface without asset or content payload", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /data-runtime-render-surface="phase-13"/);
      assert.match(response.body, /data-runtime-render-safe-empty-state/);
      assert.doesNotMatch(response.body, /\/assets\//);
      assert.doesNotMatch(response.body, /\.glb|\.gltf|\.mp3|\.wav|\.ogg/i);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"phase":"phase-13"/);
    assert.match(shellJson.body, /"loadsAssets":false/);
    assert.match(shellJson.body, /"rendersConcreteWorld":false/);
    assert.match(shellJson.body, /"implementsGameplay":false/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);
    assert.doesNotMatch(shellJson.body, /\/assets\//);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeRenderSurface":"phase-13"/);
    assert.match(health.body, /"createsRenderSurface":true/);
    assert.match(health.body, /"loadsAssets":false/);
    assert.match(health.body, /"rendersConcreteWorld":false/);
    assert.match(health.body, /"implementsAudioPlayback":false/);
  })();
});

test("runtime render surface source does not build full renderer, scene assembly, gameplay or asset loading", () => {
  const renderSources = [
    "apps/game-web/src/runtime-render-surface.ts",
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/http-server.ts",
    "packages/schemas/src/runtime-render-surface.ts",
    "packages/schemas/src/runtime-render-surface-validation.ts",
    "packages/node-types/src/runtime-render-surface-nodes.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(renderSources, /createRendererRuntime|GLTFLoader|loadGLB|new Audio\(|\.play\(/);
  assert.doesNotMatch(renderSources, /requestAnimationFrame|THREE\.|new Scene|new Mesh/);
  assert.doesNotMatch(renderSources, /fetch\(["']\/assets|src\s*=\s*["']\/assets/);
  assert.doesNotMatch(renderSources, /cameraPosition|cameraTarget|fieldOfView|ambientLight|directionalLight|hudLayout|minimapSize|audioVolume/);
});

test("browser smoke checks runtime render surface marker, safe empty state and asset silence", () => {
  const smoke = readFileSync("tests/smoke/browser-smoke.mjs", "utf8");

  assert.match(smoke, /data-runtime-render-surface/);
  assert.match(smoke, /tryRuntimeRenderSurfaceSmoke/);
  assert.match(smoke, /data-runtime-render-safe-empty-state/);
  assert.match(smoke, /asset load requests:/);
  assert.match(smoke, /render surface:/);
  assert.match(smoke, /isForbiddenRenderAssetRequest/);
});

async function requestGame(method, path) {
  const response = new MockServerResponse();
  await handleGameRequest(mockRequest(method, path), response);
  return response;
}

function mockRequest(method, path) {
  return {
    method,
    url: path,
    headers: {},
    socket: { remoteAddress: "127.0.0.1" }
  };
}

class MockServerResponse {
  statusCode = 0;
  headers = {};
  chunks = [];
  body = "";

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    this.headers = { ...this.headers, ...headers };
    return this;
  }

  setHeader(name, value) {
    this.headers[String(name).toLowerCase()] = value;
  }

  getHeader(name) {
    return this.headers[String(name).toLowerCase()];
  }

  end(chunk = "") {
    if (chunk) {
      this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
    }

    this.body = Buffer.concat(this.chunks).toString("utf8");
  }
}