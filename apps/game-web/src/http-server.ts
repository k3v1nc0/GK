import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import {
  createRuntimeClientShellResponseModel,
  renderRuntimeClientShellHtml,
  runtimeClientShellHttpContract
} from "./runtime-client-shell.js";

export interface GameRuntimeOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createGameHttpServer(): Server {
  return createServer((request, response) => {
    handleGameRequest(request, response);
  });
}

export function handleGameRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health/game") {
    sendJson(response, 200, {
      ok: true,
      service: "game-web",
      runtimeClientShell: "phase-12",
      implements3DRenderer: false,
      implementsGameplay: false,
      implementsAudioPlayback: false,
      mutatesAssets: false
    });
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
      contract: runtimeClientShellHttpContract
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
