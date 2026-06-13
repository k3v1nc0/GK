import {
  RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  RUNTIME_RENDER_SURFACE_MARKER,
  createRuntimeRenderSurfaceState,
  validateRuntimeRenderSurfaceState,
  type RuntimeClientProjectionReadRoute,
  type RuntimeRenderSurfaceState
} from "@gk/schemas";

export const RUNTIME_RENDER_SURFACE_DATA_MARKER = RUNTIME_RENDER_SURFACE_MARKER;

export interface RuntimeRenderSurfaceClientContract {
  readonly phase: typeof RUNTIME_RENDER_SURFACE_MARKER;
  readonly projectionRoutes: readonly RuntimeClientProjectionReadRoute[];
  readonly method: "GET";
  readonly credentials: "omit";
  readonly createsRenderSurface: true;
  readonly consumesRuntimeProjectionMetadata: true;
  readonly probesCanvasCapability: true;
  readonly loadsAssets: false;
  readonly rendersConcreteWorld: false;
  readonly implementsGameplay: false;
  readonly implementsMovement: false;
  readonly implementsCombat: false;
  readonly implementsAudioPlayback: false;
  readonly hardcodesCamera: false;
  readonly hardcodesLighting: false;
  readonly hardcodesHud: false;
  readonly hardcodesMinimap: false;
  readonly hardcodesContent: false;
  readonly mutatesAssets: false;
  readonly usesEditorDraftData: false;
  readonly usesEditorAdminRoutes: false;
}

export const runtimeRenderSurfaceClientContract: RuntimeRenderSurfaceClientContract = {
  phase: RUNTIME_RENDER_SURFACE_MARKER,
  projectionRoutes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
  method: "GET",
  credentials: "omit",
  createsRenderSurface: true,
  consumesRuntimeProjectionMetadata: true,
  probesCanvasCapability: true,
  loadsAssets: false,
  rendersConcreteWorld: false,
  implementsGameplay: false,
  implementsMovement: false,
  implementsCombat: false,
  implementsAudioPlayback: false,
  hardcodesCamera: false,
  hardcodesLighting: false,
  hardcodesHud: false,
  hardcodesMinimap: false,
  hardcodesContent: false,
  mutatesAssets: false,
  usesEditorDraftData: false,
  usesEditorAdminRoutes: false
};

export function createRuntimeRenderSurfaceShellState(): RuntimeRenderSurfaceState {
  return createRuntimeRenderSurfaceState({
    lifecycle: "empty",
    projectionRoutes: RUNTIME_CLIENT_PROJECTION_READ_ROUTES,
    projectionEmptyState: true
  });
}

export function renderRuntimeRenderSurfaceSection(
  state: RuntimeRenderSurfaceState = createRuntimeRenderSurfaceShellState()
): string {
  const validation = validateRuntimeRenderSurfaceState(state);
  const modelJson = escapeHtml(JSON.stringify({ state, validation, contract: runtimeRenderSurfaceClientContract }));

  return `<section class="render-surface" data-runtime-render-surface="${RUNTIME_RENDER_SURFACE_DATA_MARKER}" data-runtime-render-lifecycle="${escapeHtml(state.lifecycle)}" aria-label="Runtime render surface">
      <div class="render-header">
        <div>
          <h2>Render Surface</h2>
          <p class="muted">Canvas host and capability probe only. No projection scene is assembled.</p>
        </div>
        <span class="status-pill" data-runtime-render-lifecycle-status>${escapeHtml(state.lifecycle)}</span>
      </div>
      <div class="render-host" data-runtime-render-host>
        <canvas class="render-canvas" data-runtime-render-canvas aria-label="Runtime render surface capability probe"></canvas>
        <p data-runtime-render-safe-empty-state>No renderable projection payload available.</p>
      </div>
      <div class="render-capability-grid" data-runtime-render-capabilities>
        <span data-runtime-render-capability="canvas">canvas: not-probed</span>
        <span data-runtime-render-capability="webgl">webgl: not-probed</span>
        <span data-runtime-render-capability="webgl2">webgl2: not-probed</span>
      </div>
      <script id="runtime-render-surface-model" type="application/json">${modelJson}</script>
    </section>`;
}

export function renderRuntimeRenderSurfaceBootScript(): string {
  return `<script>
    (() => {
      const surface = document.querySelector("[data-runtime-render-surface='phase-13']");
      if (!surface) {
        return;
      }

      const canvas = surface.querySelector("[data-runtime-render-canvas]");
      const lifecycle = surface.querySelector("[data-runtime-render-lifecycle-status]");
      const safeEmpty = surface.querySelector("[data-runtime-render-safe-empty-state]");
      const capabilityNodes = surface.querySelectorAll("[data-runtime-render-capability]");

      function probeContext(type) {
        try {
          const probe = document.createElement("canvas");
          return Boolean(probe.getContext(type));
        } catch {
          return false;
        }
      }

      const capability = {
        canvas: canvas instanceof HTMLCanvasElement,
        canvas2d: probeContext("2d"),
        webgl: probeContext("webgl") || probeContext("experimental-webgl"),
        webgl2: probeContext("webgl2")
      };

      surface.setAttribute("data-runtime-render-canvas-available", String(capability.canvas));
      surface.setAttribute("data-runtime-render-webgl-available", String(capability.webgl));
      surface.setAttribute("data-runtime-render-webgl2-available", String(capability.webgl2));
      surface.setAttribute("data-runtime-render-loads-assets", "false");
      surface.setAttribute("data-runtime-render-renders-content", "false");

      for (const node of capabilityNodes) {
        const key = node.getAttribute("data-runtime-render-capability");
        if (key === "canvas") {
          node.textContent = "canvas: " + (capability.canvas ? "available" : "unavailable");
        }
        if (key === "webgl") {
          node.textContent = "webgl: " + (capability.webgl ? "available" : "unavailable");
        }
        if (key === "webgl2") {
          node.textContent = "webgl2: " + (capability.webgl2 ? "available" : "unavailable");
        }
      }

      if (lifecycle) {
        lifecycle.textContent = "empty";
      }
      if (safeEmpty) {
        safeEmpty.textContent = "Safe empty render surface. Runtime projection has no renderable payload.";
      }
    })();
  </script>`;
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
