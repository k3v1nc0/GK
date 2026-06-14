import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  createRuntimeClientShellModel,
  validateRuntimeClientShellModel,
  type RuntimeClientShellModel
} from "@gk/schemas";

import { RUNTIME_CLIENT_SHELL_STYLES } from "./runtime-client-shell-styles.js";
import {
  renderRuntimeAssetReferencePlanningSection,
  runtimeAssetReferencePlanningClientContract
} from "./runtime-asset-reference-planning.js";
import {
  renderRuntimeGameCoreSection,
  runtimeGameCoreClientContract
} from "./runtime-game-core.js";
import {
  renderRuntimeRenderSurfaceBootScript,
  renderRuntimeRenderSurfaceSection,
  runtimeRenderSurfaceClientContract
} from "./runtime-render-surface.js";
import {
  renderRuntimeSceneAssemblySection,
  runtimeSceneAssemblyClientContract
} from "./runtime-scene-assembly.js";
import { runtimeProjectionFetchClientContract } from "./runtime-projection-client.js";

export const RUNTIME_CLIENT_SHELL_MARKER = "phase-12" as const;

export const RUNTIME_CLIENT_SHELL_HTTP_ROUTES = ["/", "/game", "/game/", "/game/shell.json"] as const;

export interface RuntimeClientShellHttpContract {
  readonly routes: typeof RUNTIME_CLIENT_SHELL_HTTP_ROUTES;
  readonly consumesRuntimeProjectionRoutes: typeof RUNTIME_CLIENT_PROJECTION_READ_ROUTES;
  readonly usesEditorAdminRoutes: false;
  readonly usesEditorDraftData: false;
  readonly implements3DRenderer: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
  readonly renderSurface: typeof runtimeRenderSurfaceClientContract;
  readonly sceneAssembly: typeof runtimeSceneAssemblyClientContract;
  readonly assetReferencePlanning: typeof runtimeAssetReferencePlanningClientContract;
  readonly runtimeGameCore: typeof runtimeGameCoreClientContract;
}

export const runtimeClientShellHttpContract: RuntimeClientShellHttpContract = {
  routes: RUNTIME_CLIENT_SHELL_HTTP_ROUTES,
  consumesRuntimeProjectionRoutes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  usesEditorAdminRoutes: false,
  usesEditorDraftData: false,
  implements3DRenderer: false,
  implementsGameplay: false,
  implementsMovement: false,
  implementsCombat: false,
  implementsAudioPlayback: false,
  hardcodesContent: false,
  mutatesAssets: false,
  renderSurface: runtimeRenderSurfaceClientContract,
  sceneAssembly: runtimeSceneAssemblyClientContract,
  assetReferencePlanning: runtimeAssetReferencePlanningClientContract,
  runtimeGameCore: runtimeGameCoreClientContract
};

export function createRuntimeClientShellResponseModel(route: RuntimeClientShellModel["route"] = "/game/"): RuntimeClientShellModel {
  return createRuntimeClientShellModel({ route });
}

export function renderRuntimeClientShellHtml(model: RuntimeClientShellModel = createRuntimeClientShellResponseModel()): string {
  const validation = validateRuntimeClientShellModel(model);
  const shellJson = escapeHtml(JSON.stringify({ model, validation }));
  const routeList = runtimeProjectionFetchClientContract.routes
    .map((route) => `<li><code>${escapeHtml(route)}</code></li>`)
    .join("");
  const renderSurface = renderRuntimeRenderSurfaceSection();
  const sceneAssembly = renderRuntimeSceneAssemblySection();
  const assetReferencePlanning = renderRuntimeAssetReferencePlanningSection();
  const runtimeGameCore = renderRuntimeGameCoreSection();

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GK Runtime Client Shell</title>
  <style>${RUNTIME_CLIENT_SHELL_STYLES}</style>
</head>
<body>
  <main data-runtime-client-shell="${RUNTIME_CLIENT_SHELL_MARKER}" data-runtime-client-route="${escapeHtml(model.route)}">
    <header>
      <div>
        <h1>Runtime Client Shell</h1>
        <p class="muted">Read-only projection metadata shell. Renderer, asset loading and gameplay phases are not open.</p>
      </div>
      <div class="status-pill" data-runtime-client-status>${escapeHtml(model.status)}</div>
    </header>

    <section class="runtime-grid" aria-label="Runtime projection state">
      <article class="panel" data-runtime-projection-status>
        <h2>Projection Status</h2>
        <p data-runtime-projection-status-text>Loading runtime projection status.</p>
      </article>
      <article class="panel" data-runtime-projection-manifest>
        <h2>Manifest</h2>
        <p data-runtime-empty-state>No runtime projection available.</p>
      </article>
      <article class="panel" data-runtime-projection-records>
        <h2>Records</h2>
        <p data-runtime-records-empty-state>No runtime projection records available.</p>
      </article>
    </section>

    ${renderSurface}
    ${sceneAssembly}
    ${assetReferencePlanning}
    ${runtimeGameCore}

    <section class="panel" aria-label="Runtime projection read-only routes" style="margin-top:12px">
      <h2>Read-only projection routes</h2>
      <ul>${routeList}</ul>
    </section>

    <section class="error" data-runtime-error hidden></section>
    <script id="runtime-client-shell-model" type="application/json">${shellJson}</script>
  </main>
  ${renderRuntimeRenderSurfaceBootScript()}
  <script>
    (() => {
      const routes = ${JSON.stringify(runtimeProjectionFetchClientContract.routes)};
      const statusText = document.querySelector("[data-runtime-projection-status-text]");
      const manifestPanel = document.querySelector("[data-runtime-projection-manifest]");
      const recordsPanel = document.querySelector("[data-runtime-projection-records]");
      const statusPill = document.querySelector("[data-runtime-client-status]");
      const errorPanel = document.querySelector("[data-runtime-error]");

      async function readJson(route) {
        const response = await fetch(route, {
          method: "GET",
          credentials: "omit",
          headers: { Accept: "application/json" }
        });
        const body = await response.json().catch(() => null);
        return { ok: response.ok, status: response.status, body };
      }

      function setText(element, text) {
        if (element) {
          element.textContent = text;
        }
      }

      function showError(message) {
        if (errorPanel) {
          errorPanel.hidden = false;
          errorPanel.textContent = message;
        }
      }

      async function bootRuntimeShell() {
        try {
          const [status, manifest, records] = await Promise.all(routes.map((route) => readJson(route)));

          if (!status.ok || !manifest.ok || !records.ok) {
            showError("Runtime projection read-only routes are unavailable.");
            setText(statusPill, "error");
            return;
          }

          const statusBody = status.body || {};
          const manifestBody = manifest.body || {};
          const recordsBody = records.body || {};
          const recordCount = Array.isArray(recordsBody.records) ? recordsBody.records.length : 0;
          const hasManifest = Boolean(manifestBody.manifest);

          setText(statusPill, hasManifest || recordCount > 0 ? "ready" : "empty");
          setText(statusText, statusBody.emptyState ? "No runtime projection has been published to the read model." : "Runtime projection metadata is readable.");

          if (manifestPanel) {
            manifestPanel.setAttribute("data-runtime-empty-state", String(!hasManifest));
          }

          if (recordsPanel) {
            recordsPanel.setAttribute("data-runtime-record-count", String(recordCount));
          }
        } catch {
          showError("Runtime projection status could not be loaded.");
          setText(statusPill, "error");
        }
      }

      void bootRuntimeShell();
    })();
  </script>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const escaped: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };

    return escaped[char] ?? char;
  });
}
