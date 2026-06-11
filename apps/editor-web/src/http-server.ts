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
  <style>
    body {
      font-family: system-ui, sans-serif;
      margin: 0;
      color: #141414;
      background: #f7f7f5;
    }
    [hidden] {
      display: none !important;
    }
    .login-shell {
      display: grid;
      min-height: 100vh;
      place-items: center;
      padding: 24px;
    }
    .login-panel {
      width: min(100%, 380px);
      border: 1px solid #d8d8d4;
      border-radius: 8px;
      padding: 24px;
      background: #fff;
    }
    .login-panel label,
    .login-panel input,
    .login-panel button {
      display: block;
      width: 100%;
      box-sizing: border-box;
    }
    .login-panel label {
      margin-top: 14px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .login-panel input {
      margin-top: 6px;
      padding: 10px;
      border: 1px solid #b9b9b4;
      border-radius: 6px;
      font: inherit;
    }
    .login-panel button,
    .editor-toolbar button {
      padding: 10px 12px;
      border: 1px solid #202020;
      border-radius: 6px;
      color: #fff;
      background: #202020;
      font: inherit;
      cursor: pointer;
    }
    .login-panel button {
      margin-top: 18px;
    }
    .status {
      min-height: 1.4em;
      margin-top: 12px;
      color: #7a1f1f;
    }
    .editor-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 16px;
      border-bottom: 1px solid #d8d8d4;
      background: #fff;
    }
    .editor-grid {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr) 260px;
      grid-template-rows: minmax(360px, 1fr) 130px auto;
      min-height: calc(100vh - 58px);
    }
    .editor-grid > * {
      border: 1px solid #d8d8d4;
      padding: 12px;
      background: #fff;
    }
    .main-workspace {
      min-width: 0;
    }
    .history {
      grid-column: 1 / 4;
    }
    .dock {
      grid-column: 1 / 4;
    }
    .empty-zone {
      min-height: 120px;
      border: 1px dashed #aaa;
      border-radius: 6px;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <section id="login-view" class="login-shell" data-editor-login="required">
    <form id="editor-login-form" class="login-panel">
      <h1>GK Editor</h1>
      <p>Editor admin login</p>
      <label for="editor-email">E-mail</label>
      <input id="editor-email" name="email" type="email" autocomplete="username" required>
      <label for="editor-password">Wachtwoord</label>
      <input id="editor-password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Inloggen</button>
      <p id="login-status" class="status" role="status"></p>
    </form>
  </section>
  <main id="editor-view" data-editor-shell="phase-5" hidden>
    <header class="editor-toolbar">
      <strong>GK Editor</strong>
      <button id="editor-logout" type="button">Uitloggen</button>
    </header>
    <div class="editor-grid">
      <aside aria-label="Node Library">Node Library</aside>
      <section class="main-workspace" aria-label="Main workspace">
        <div role="tablist">${tabs}</div>
        <section class="empty-zone" role="tabpanel" aria-label="Node Canvas" data-empty-node-canvas="true"></section>
        <section class="empty-zone" role="tabpanel" aria-label="Viewport / World Preview" data-empty-world-preview="true">Empty world preview</section>
      </section>
      <aside aria-label="Inspector and Validation">Inspector / Validation</aside>
      <footer class="history" aria-label="History">History</footer>
      <nav class="dock" aria-label="Dock panels"><ul>${panels}</ul></nav>
    </div>
  </main>
  <script>
    (() => {
      const loginView = document.getElementById("login-view");
      const editorView = document.getElementById("editor-view");
      const loginForm = document.getElementById("editor-login-form");
      const status = document.getElementById("login-status");
      const logoutButton = document.getElementById("editor-logout");

      function readCookie(name) {
        const prefix = name + "=";
        return document.cookie
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(prefix))
          ?.slice(prefix.length) || "";
      }

      function csrfHeaders() {
        const token = readCookie("gk_csrf");
        return token ? { "X-GK-CSRF-Token": token } : {};
      }

      function showLogin(message = "") {
        loginView.hidden = false;
        editorView.hidden = true;
        status.textContent = message;
      }

      function showEditor() {
        loginView.hidden = true;
        editorView.hidden = false;
        status.textContent = "";
      }

      async function refreshSession() {
        const response = await fetch("/auth/editor/me", {
          credentials: "same-origin",
          headers: { "Accept": "application/json" }
        });

        if (!response.ok) {
          showLogin();
          return;
        }

        const session = await response.json();

        if (session.authenticated === true && Array.isArray(session.roles) && session.roles.includes("editor_admin")) {
          showEditor();
          return;
        }

        showLogin("Editor admin toegang vereist.");
      }

      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        status.textContent = "Inloggen...";

        const data = new FormData(loginForm);
        const response = await fetch("/auth/editor/login", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({
            email: String(data.get("email") || ""),
            password: String(data.get("password") || "")
          })
        });

        if (!response.ok) {
          showLogin("Login mislukt.");
          return;
        }

        await refreshSession();
      });

      logoutButton.addEventListener("click", async () => {
        await fetch("/auth/editor/logout", {
          method: "POST",
          credentials: "same-origin",
          headers: csrfHeaders()
        });
        showLogin();
      });

      void refreshSession().catch(() => showLogin("Sessiestatus kon niet worden gecontroleerd."));
    })();
  </script>
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
