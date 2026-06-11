import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { createEditorShellModel } from "./editor-shell.js";

export interface EditorRuntimeOptions {
  readonly port?: number;
  readonly host?: string;
}

export function createEditorHttpServer(): Server {
  return createServer((request, response) => {
    handleEditorRequest(request, response);
  });
}

export function handleEditorRequest(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (request.method === "GET" && url.pathname === "/health/editor") {
    sendJson(response, 200, { ok: true, service: "editor-web", editorRuntime: "ready" });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/editor" || url.pathname === "/editor/")) {
    sendHtml(response, 200, renderEditorShellHtml());
    return;
  }

  if (request.method === "GET" && (url.pathname === "/shell.json" || url.pathname === "/editor/shell.json")) {
    sendJson(response, 200, createEditorShellModel());
    return;
  }

  response.writeHead(404, {
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff"
  });
  response.end("Not found");
}

export function startEditorServer(options: EditorRuntimeOptions = {}): Server {
  const port = options.port ?? Number(process.env.GK_EDITOR_PORT ?? process.env.PORT ?? 3000);
  const host = options.host ?? process.env.GK_EDITOR_HOST ?? "127.0.0.1";
  const server = createEditorHttpServer();

  server.listen(port, host, () => {
    console.log(`GK editor-web listening on http://${host}:${port}`);
  });

  return server;
}

function renderEditorShellHtml(): string {
  const shell = createEditorShellModel();
  const panels = shell.panels.map((panel) => `<li>${escapeHtml(panel.title)}</li>`).join("");
  const tabs = shell.mainTabs.map((tab) => `<button role="tab">${escapeHtml(tab.title)}</button>`).join("");

  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GK Editor</title>
</head>
<body>
  <main data-editor-shell="phase-5">
    <aside aria-label="Node Library">Node Library</aside>
    <section aria-label="Main workspace">
      <div role="tablist">${tabs}</div>
      <section role="tabpanel" aria-label="Node Canvas" data-empty-node-canvas="true"></section>
      <section role="tabpanel" aria-label="Viewport / World Preview" data-empty-world-preview="true">Empty world preview</section>
    </section>
    <aside aria-label="Inspector and Validation">Inspector / Validation</aside>
    <footer aria-label="History">History</footer>
    <nav aria-label="Dock panels"><ul>${panels}</ul></nav>
  </main>
</body>
</html>`;
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
