import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  createRuntimeClientShellModel,
  validateRuntimeClientShellModel,
  type RuntimeClientShellModel
} from "@gk/schemas";

import {
  renderRuntimeRenderSurfaceBootScript,
  renderRuntimeRenderSurfaceSection,
  runtimeRenderSurfaceClientContract
} from "./runtime-render-surface.js";
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
  renderSurface: runtimeRenderSurfaceClientContract
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

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GK Runtime Client Shell</title>
  <style>
    :root {
      color-scheme: light;
      font-family: system-ui, sans-serif;
      background: #f6f7f8;
      color: #15171a;
    }
    body {
      margin: 0;
      min-height: 100vh;
      background: #f6f7f8;
    }
    main {
      width: min(1040px, calc(100% - 32px));
      margin: 0 auto;
      padding: 32px 0;
    }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      border-bottom: 1px solid #d9dde3;
      padding-bottom: 18px;
    }
    h1 {
      margin: 0;
      font-size: 1.6rem;
      line-height: 1.2;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 10px;
      font-size: 1rem;
      line-height: 1.3;
      letter-spacing: 0;
    }
    p {
      margin: 8px 0 0;
      line-height: 1.5;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
    }
    .status-pill {
      border: 1px solid #b8c0cc;
      border-radius: 6px;
      padding: 6px 10px;
      background: #fff;
      white-space: nowrap;
    }
    .runtime-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .panel,
    .render-surface {
      min-width: 0;
      border: 1px solid #d9dde3;
      border-radius: 8px;
      padding: 14px;
      background: #fff;
    }
    .panel ul {
      margin: 0;
      padding-left: 18px;
    }
    .render-surface {
      margin-top: 12px;
    }
    .render-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 12px;
    }
    .render-host {
      position: relative;
      min-height: 180px;
      display: grid;
      place-items: center;
      overflow: hidden;
      border: 1px solid #c6ccd4;
      border-radius: 6px;
      background: #15171a;
      color: #fff;
    }
    .render-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0.04;
      pointer-events: none;
    }
    .render-host p {
      position: relative;
      margin: 0;
      padding: 16px;
      text-align: center;
    }
    .render-capability-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-top: 10px;
    }
    .render-capability-grid span {
      min-width: 0;
      border: 1px solid #d9dde3;
      border-radius: 6px;
      padding: 8px;
      background: #f6f7f8;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.82rem;
      overflow-wrap: anywhere;
    }
    .muted {
      color: #5c6672;
    }
    .error {
      margin-top: 18px;
      border: 1px solid #b84a4a;
      border-radius: 8px;
      padding: 12px;
      color: #7b1f1f;
      background: #fff7f7;
    }
    [hidden] {
      display: none !important;
    }
    @media (max-width: 760px) {
      header,
      .runtime-grid,
      .render-header,
      .render-capability-grid {
        display: block;
      }
      .panel,
      .render-capability-grid span {
        margin-top: 12px;
      }
      .status-pill {
        display: inline-block;
        margin-top: 12px;
      }
    }
  </style>
</head>
<body>
  <main data-runtime-client-shell="${RUNTIME_CLIENT_SHELL_MARKER}" data-runtime-client-route="${escapeHtml(model.route)}">
    <header>
      <div>
        <h1>Runtime Client Shell</h1>
        <p class="muted">Read-only projection metadata shell. Renderer and gameplay phases are not open.</p>
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
