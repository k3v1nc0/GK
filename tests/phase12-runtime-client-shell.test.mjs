import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  NODE_VALUE_SOCKET_TYPES,
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  SCHEMA_PACKAGE_SCOPE,
  createRuntimeClientProjectionState,
  createRuntimeClientSafetyFlags,
  createRuntimeClientShellModel,
  validateRuntimeClientProjectionRoutes,
  validateRuntimeClientShellModel
} from "../packages/schemas/src/index.ts";
import { getCoreGraphNodeTypes } from "../packages/node-types/src/index.ts";
import {
  assertRuntimeProjectionFetchRoute,
  listRuntimeProjectionFetchRoutes,
  runtimeProjectionFetchClientContract
} from "../apps/game-web/src/runtime-projection-client.ts";
import {
  createRuntimeClientShellResponseModel,
  renderRuntimeClientShellHtml,
  runtimeClientShellHttpContract
} from "../apps/game-web/src/runtime-client-shell.ts";
import { handleGameRequest } from "../apps/game-web/src/http-server.ts";

const nodeTypes = new Set(getCoreGraphNodeTypes().map((node) => node.type));

test("Fase 12 schema package exports runtime client shell contracts from real modules", () => {
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-client-shell"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-client-shell-validation"), true);
  assert.equal(SCHEMA_PACKAGE_SCOPE.includes("runtime-client-shell-core"), false);
});

test("Fase 12 runtime client sockets and node contracts are registered", () => {
  for (const socketType of [
    "runtime.client.shell.reference",
    "runtime.client.boot-state.reference",
    "runtime.client.projection-state.reference",
    "runtime.client.safety.reference"
  ]) {
    assert.equal(NODE_VALUE_SOCKET_TYPES.includes(socketType), true, `${socketType} should exist`);
  }

  for (const nodeType of [
    "gk.runtimeClient.shell",
    "gk.runtimeClient.bootState",
    "gk.runtimeClient.projectionState",
    "gk.runtimeClient.safetyFlags"
  ]) {
    assert.equal(nodeTypes.has(nodeType), true, `${nodeType} should be registered`);
  }

  const runtimeClientNodes = getCoreGraphNodeTypes().filter((node) => node.type.startsWith("gk.runtimeClient."));
  assert.equal(runtimeClientNodes.every((node) => node.scope === "runtime-consumer"), true);
  assert.equal(runtimeClientNodes.every((node) => node.createsConcreteGameContent === false), true);
  assert.equal(runtimeClientNodes.every((node) => node.validate.validate({ implementsGameplay: true }).length > 0), true);
});

test("runtime client shell contracts validate safe default state", () => {
  const model = createRuntimeClientShellModel();
  const validation = validateRuntimeClientShellModel(model);

  assert.equal(validation.valid, true);
  assert.equal(model.phase, "phase-12");
  assert.equal(model.projection.emptyState, true);
  assert.equal(model.safetyFlags.consumesRuntimeProjection, true);
  assert.equal(model.safetyFlags.usesEditorDraftData, false);
  assert.equal(model.safetyFlags.implements3DRenderer, false);
  assert.equal(model.safetyFlags.implementsGameplay, false);
  assert.equal(model.safetyFlags.implementsCombat, false);
  assert.equal(model.safetyFlags.implementsMovement, false);
  assert.equal(model.safetyFlags.implementsAudioPlayback, false);
  assert.equal(model.safetyFlags.hardcodesContent, false);
  assert.equal(model.safetyFlags.mutatesAssets, false);
});

test("runtime client shell rejects editor routes, draft leakage, renderer, gameplay and asset mutation", () => {
  const unsafeModel = createRuntimeClientShellModel({
    projection: createRuntimeClientProjectionState({
      routes: ["/editor/runtime-projection/status"],
      emptyState: false
    }),
    safetyFlags: createRuntimeClientSafetyFlags({
      usesEditorDraftData: true,
      usesEditorAdminRoutes: true,
      implements3DRenderer: true,
      implementsGameplay: true,
      implementsCombat: true,
      implementsMovement: true,
      implementsAudioPlayback: true,
      hardcodesContent: true,
      mutatesAssets: true,
      leaksEditorDraftData: true
    }),
    hardcodedContentIndicators: ["hardcoded-content"]
  });
  const validation = validateRuntimeClientShellModel(unsafeModel);

  assert.equal(validation.valid, false);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-admin-routes"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-editor-draft-data"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-renderer-gameplay"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-audio-playback"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-asset-mutation"), true);
  assert.equal(validation.issues.some((issue) => issue.gate === "no-hardcoded-content"), true);
});

test("runtime projection fetch client only uses runtime read-only routes", () => {
  assert.deepEqual(listRuntimeProjectionFetchRoutes(), RUNTIME_CLIENT_PROJECTION_READ_ROUTES);
  assert.equal(runtimeProjectionFetchClientContract.method, "GET");
  assert.equal(runtimeProjectionFetchClientContract.credentials, "omit");
  assert.equal(runtimeProjectionFetchClientContract.readOnly, true);
  assert.equal(runtimeProjectionFetchClientContract.consumesEditorAdminRoutes, false);
  assert.equal(runtimeProjectionFetchClientContract.usesEditorDraftData, false);
  assert.equal(runtimeProjectionFetchClientContract.mutatesData, false);
  assert.equal(runtimeProjectionFetchClientContract.mutatesAssets, false);
  assert.equal(assertRuntimeProjectionFetchRoute("/runtime/projection/status"), "/runtime/projection/status");
  assert.throws(() => assertRuntimeProjectionFetchRoute("/editor/runtime-projection/status"), /runtime_projection_route_not_allowed/);
  assert.equal(validateRuntimeClientProjectionRoutes(["/editor/runtime-projection/status"]).some((issue) => issue.gate === "no-editor-admin-routes"), true);
});

test("runtime client shell renders safe empty-state UI without editor/admin routes or content", () => {
  const model = createRuntimeClientShellResponseModel();
  const html = renderRuntimeClientShellHtml(model);

  assert.match(html, /data-runtime-client-shell="phase-12"/);
  assert.match(html, /data-runtime-projection-status/);
  assert.match(html, /data-runtime-empty-state/);
  assert.match(html, /No runtime projection available/);
  assert.match(html, /\/runtime\/projection\/status/);
  assert.match(html, /\/runtime\/projection\/manifest/);
  assert.match(html, /\/runtime\/projection\/records/);
  assert.doesNotMatch(html, /\/editor\//);
  assert.doesNotMatch(html, /\/auth\/editor/);
  assert.doesNotMatch(html, /dummy|NPC|quest|economy|loot/i);
});

test("game web shell routes expose runtime client shell and shell.json", () => {
  return (async () => {
    for (const path of ["/", "/game", "/game/"]) {
      const response = await requestGame("GET", path);

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /data-runtime-client-shell="phase-12"/);
      assert.match(response.body, /No runtime projection available/);
    }

    const shellJson = await requestGame("GET", "/game/shell.json");
    assert.equal(shellJson.statusCode, 200);
    assert.match(shellJson.body, /"phase":"phase-12"/);
    assert.match(shellJson.body, /\/runtime\/projection\/status/);
    assert.doesNotMatch(shellJson.body, /\/editor\//);

    const health = await requestGame("GET", "/health/game");
    assert.equal(health.statusCode, 200);
    assert.match(health.body, /"runtimeClientShell":"phase-12"/);
    assert.match(health.body, /"implements3DRenderer":false/);
    assert.match(health.body, /"implementsGameplay":false/);
    assert.match(health.body, /"implementsAudioPlayback":false/);
  })();
});

test("game web proxies runtime projection read-only routes to the API origin", () => {
  return (async () => {
    const originalFetch = globalThis.fetch;

    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            ok: true,
            status: "empty",
            emptyState: true,
            implementsRuntimeRenderer: false
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
              "x-content-type-options": "nosniff"
            }
          }
        );

      const response = await requestGame("GET", "/runtime/projection/status");

      assert.equal(response.statusCode, 200);
      assert.match(response.body, /"status":"empty"/);
      assert.match(response.body, /"emptyState":true/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  })();
});

test("runtime client shell source does not build renderer, gameplay or asset mutation", () => {
  const shellSources = [
    "apps/game-web/src/runtime-client-shell.ts",
    "apps/game-web/src/runtime-projection-client.ts",
    "apps/game-web/src/http-server.ts"
  ].map((file) => readFileSync(file, "utf8")).join("\n");

  assert.doesNotMatch(shellSources, /createRendererRuntime|createAudioRuntime|acceptPublishedNode|bindPublishedNode/);
  assert.doesNotMatch(shellSources, /\/editor\//);
  assert.doesNotMatch(shellSources, /uploadAsset|writeFile|copyFile|unlink/);
  assert.equal(runtimeClientShellHttpContract.usesEditorAdminRoutes, false);
  assert.equal(runtimeClientShellHttpContract.implements3DRenderer, false);
  assert.equal(runtimeClientShellHttpContract.implementsGameplay, false);
  assert.equal(runtimeClientShellHttpContract.implementsMovement, false);
  assert.equal(runtimeClientShellHttpContract.implementsCombat, false);
  assert.equal(runtimeClientShellHttpContract.implementsAudioPlayback, false);
  assert.equal(runtimeClientShellHttpContract.hardcodesContent, false);
  assert.equal(runtimeClientShellHttpContract.mutatesAssets, false);
});

test("browser smoke can check runtime shell route or skip cleanly", () => {
  const smoke = readFileSync("tests/smoke/browser-smoke.mjs", "utf8");

  assert.match(smoke, /GK_GAME_SHELL_PATH/);
  assert.match(smoke, /data-runtime-client-shell/);
  assert.match(smoke, /tryRuntimeShellSmoke/);
  assert.match(smoke, /runtime shell:/);
  assert.match(smoke, /skipped: runtime client shell marker unavailable/);
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
