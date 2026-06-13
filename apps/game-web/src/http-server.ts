import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  createRuntimeClientShellResponseModel,
  renderRuntimeClientShellHtml,
  runtimeClientShellHttpContract
} from "./runtime-client-shell.js";
import {
  createRuntimeRenderSurfaceShellState,
  runtimeRenderSurfaceClientContract
} from "./runtime-render-surface.js";
import {
  createRuntimeSceneAssemblyShellState,
  runtimeSceneAssemblyClientContract
} from "./runtime-scene-assembly.js";

export interface GameRuntimeOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createGameHttpServer(): Server {
  return createServer((request, response) => {
    void handleGameRequest(request, response).catch(() => {
      sendJson(response, 500, { ok: false, error: "internal_error" });
    });
  });
}

export async function handleGameRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health/game") {
    sendJson(response, 200, {
      ok: true,
      service: "game-web",
      runtimeClientShell: "phase-12",
      runtimeRenderSurface: "phase-13",
      runtimeSceneAssembly: "phase-14",
      createsRenderSurface: true,
      consumesRuntimeProjectionRecords: true,
      producesScenePlan: true,
      implements3DRenderer: false,
      loadsAssets: false,
      resolvesFinalAssetRoles: false,
      rendersConcreteWorld: false,
      rendersScene: false,
      rendererDrawCalls: false,
      implementsGameplay: false,
      implementsMovement: false,
      implementsCombat: false,
      implementsAudioPlayback: false,
      hardcodesWorld: false,
      hardcodesCamera: false,
      hardcodesLighting: false,
      hardcodesHud: false,
      hardcodesMinimap: false,
      hardcodesContent: false,
      mutatesAssets: false
    });
    return;
  }

  if (request.method === "GET" && isRuntimeProjectionReadRoute(url.pathname)) {
    await proxyRuntimeProjectionRoute(request, response, url.pathname);
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/game" || url.pathname === "/game/")) {
    sendHtml(response, 200, renderRuntimeClientShellHtml(createRuntimeClientShellResponseModel(normalizeShellRoute(url.pathname))));
    return;
  }

  if (request.method === "GET" && url.pathname === "/game/shell.json") {
    sendJson(response, 200, {
      ok: true,
      shell: createRuntimeClientShellResponseModel("/game/shell.json"),
      contract: runtimeClientShellHttpContract,
      renderSurface: createRuntimeRenderSurfaceShellState(),
      renderSurfaceContract: runtimeRenderSurfaceClientContract,
      sceneAssembly: createRuntimeSceneAssemblyShellState(),
      sceneAssemblyContract: runtimeSceneAssemblyClientContract
    });
    return;
  }

  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end("Not found");
}

export function startGameServer(options: GameRuntimeOptions = {}): Server {
  const port = options.port ?? Number(process.env.GK_GAME_PORT ?? process.env.PORT ?? 3003);
  const host = options.host ?? process.env.GK_GAME_HOST ?? "127.0.0.1";
  const server = createGameHttpServer();

  server.listen(port, host, () => {
    console.log(`GK game-web runtime client shell listening on http://${host}:${port}`);
  });

  return server;
}

function normalizeShellRoute(pathname: string): "/" | "/game" | "/game/" {
  if (pathname === "/game") {
    return "/game";
  }

  if (pathname === "/") {
    return "/";
  }

  return "/game/";
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(body);
}

function isRuntimeProjectionReadRoute(pathname: string): boolean {
  return runtimeClientShellHttpContract.consumesRuntimeProjectionRoutes.includes(pathname as never);
}

async function proxyRuntimeProjectionRoute(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string
): Promise<void> {
  const apiOrigin = process.env.GK_API_ORIGIN ?? "http://127.0.0.1:3001";
  const upstreamUrl = new URL(pathname, apiOrigin);
  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: request.headers.accept ?? "application/json"
    }
  });

  const body = Buffer.from(await upstream.arrayBuffer());
  response.writeHead(upstream.status, {
    "content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    "cache-control": upstream.headers.get("cache-control") ?? "no-store",
    "x-content-type-options": upstream.headers.get("x-content-type-options") ?? "nosniff"
  });
  response.end(body);
}
