import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const editorAdminSession = {
  scope: "editor",
  editorRoles: ["editor_admin"]
};

const gameSession = {
  scope: "game",
  gameUserStatus: "active",
  emailVerified: true
};

const runtimeDistReady =
  existsSync("apps/api-server/dist/http-server.js") &&
  existsSync("apps/api-server/dist/gamebible-node-routes.js") &&
  existsSync("apps/api-server/dist/gamebible-node-store.js") &&
  existsSync("apps/editor-web/dist/http-server.js");

async function loadApiRuntime() {
  return import("../apps/api-server/dist/http-server.js");
}

async function loadEditorRuntime() {
  return import("../apps/editor-web/dist/http-server.js");
}

async function loadGameBibleNodeRoutes() {
  return import("../apps/api-server/dist/gamebible-node-routes.js");
}

async function loadGameBibleNodeStore() {
  return import("../apps/api-server/dist/gamebible-node-store.js");
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.equal(typeof address, "object");
      resolve(address.port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function withEnv(values, callback) {
  const previous = new Map();

  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createRequest(headers = {}) {
  return { headers };
}

describe("Fase 5.1 lint boundary", () => {
  it("skips generated directories instead of reading them as source files", async () => {
    const distPath = "apps/editor-web/dist/nested";
    const modulesPath = "apps/editor-web/node_modules/generated-package";

    await mkdir(distPath, { recursive: true });
    await mkdir(modulesPath, { recursive: true });
    await writeFile(join(distPath, "generated.txt"), "generated output");
    await writeFile(join(modulesPath, "index.js"), "export default true;");

    try {
      const run = spawnSync(process.execPath, ["scripts/check-workspace-boundaries.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8"
      });

      assert.equal(run.status, 0, run.stderr || run.stdout);
      assert.match(run.stdout, /workspace boundaries ok/);
    } finally {
      await rm("apps/editor-web/dist", { recursive: true, force: true });
      await rm("apps/editor-web/node_modules", { recursive: true, force: true });
    }
  });
});

describe("Fase 5.1 HTTP runtime", () => {
  it("starts an API server with editor health, session and Game Users routes", { skip: !runtimeDistReady }, async () => {
    const { createApiHttpServer } = await loadApiRuntime();
    const server = createApiHttpServer();
    const port = await listen(server);

    try {
      await withEnv({ GK_ENABLE_SMOKE_AUTH_HEADERS: "1" }, async () => {
        const health = await fetch(`http://127.0.0.1:${port}/health/editor`);
        assert.equal(health.status, 200);
        assert.equal((await health.json()).service, "api-server");

        const missingSession = await fetch(`http://127.0.0.1:${port}/auth/editor/me`);
        assert.equal(missingSession.status, 401);

        const editorMe = await fetch(`http://127.0.0.1:${port}/auth/editor/me`, {
          headers: {
            "x-gk-smoke-scope": "editor",
            "x-gk-smoke-editor-roles": "editor_admin"
          }
        });
        assert.equal(editorMe.status, 200);
        assert.deepEqual((await editorMe.json()).roles, ["editor_admin"]);

        const gameUserList = await fetch(`http://127.0.0.1:${port}/editor/game-users`, {
          headers: {
            "x-gk-smoke-scope": "game"
          }
        });
        assert.equal(gameUserList.status, 403);
      });
    } finally {
      await close(server);
    }
  });

  it("starts an editor-web server with Node Canvas and empty World Preview zones", { skip: !runtimeDistReady }, async () => {
    const { createEditorHttpServer } = await loadEditorRuntime();
    const server = createEditorHttpServer();
    const port = await listen(server);

    try {
      const shell = await fetch(`http://127.0.0.1:${port}/editor/`);
      const html = await shell.text();

      assert.equal(shell.status, 200);
      assert.match(html, /Node Canvas/);
      assert.match(html, /Viewport \/ World Preview/);
      assert.match(html, /data-empty-node-canvas="true"/);
      assert.match(html, /data-empty-world-preview="true"/);
      assert.doesNotMatch(html, /<img\b|<audio\b|<video\b/i);

      const model = await fetch(`http://127.0.0.1:${port}/editor/shell.json`);
      assert.equal(model.status, 200);
      assert.deepEqual((await model.json()).mainTabs, ["node-canvas", "viewport-world-preview"]);

    } finally {
      await close(server);
    }
  });
});

describe("Fase 5.1 GameBibleNode save protection", () => {
  it("requires editor_admin, allowed origin and CSRF proof", { skip: !runtimeDistReady }, async () => {
    const { validateGameBibleNodeSavePolicy } = await loadGameBibleNodeRoutes();

    await withEnv(
      {
        GK_ALLOWED_ORIGINS: "https://gk-k3v1nc0.duckdns.org",
        GK_REQUIRE_CSRF: undefined,
        GK_ALLOW_MISSING_ORIGIN_FOR_SMOKE: undefined
      },
      () => {
        assert.deepEqual(
          validateGameBibleNodeSavePolicy(
            createRequest({
              origin: "https://gk-k3v1nc0.duckdns.org",
              cookie: "gk_csrf=token",
              "x-gk-csrf-token": "token"
            }),
            editorAdminSession
          ),
          { allowed: true }
        );

        assert.equal(
          validateGameBibleNodeSavePolicy(
            createRequest({
              origin: "https://gk-k3v1nc0.duckdns.org",
              cookie: "gk_csrf=token",
              "x-gk-csrf-token": "token"
            }),
            gameSession
          ).reason,
          "missing_editor_admin"
        );

        assert.equal(
          validateGameBibleNodeSavePolicy(
            createRequest({
              origin: "https://gk-k3v1nc0.duckdns.org"
            }),
            editorAdminSession
          ).reason,
          "csrf_required"
        );

        assert.equal(
          validateGameBibleNodeSavePolicy(
            createRequest({
              origin: "https://example.invalid",
              cookie: "gk_csrf=token",
              "x-gk-csrf-token": "token"
            }),
            editorAdminSession
          ).reason,
          "origin_not_allowed"
        );
      }
    );
  });

  it("writes GameBibleNode JSON with a backup and without leaving temp or lock files", { skip: !runtimeDistReady }, async () => {
    const { writeGameBibleNodeJsonAtomically } = await loadGameBibleNodeStore();
    const dir = await mkdtemp(join(tmpdir(), "gk-gamebible-"));
    const target = join(dir, "GameBibleNode.json");

    await writeFile(target, `${JSON.stringify({ schema: "gamebible-node-system", nodes: [] })}\n`);

    const result = await writeGameBibleNodeJsonAtomically(
      {
        schema: "gamebible-node-system",
        nodes: [{ id: "contract-node" }]
      },
      target
    );

    assert.equal(result.auditAction, "game_bible_node.save");
    assert.equal(existsSync(result.backupPath), true);
    assert.match(await readFile(target, "utf8"), /contract-node/);
    assert.equal(existsSync(`${target}.lock`), false);

    await rm(dir, { recursive: true, force: true });
  });

  it("keeps the legacy PHP route POST-only and protected", () => {
    const source = readFileSync("README/GameBibleNode.php", "utf8");

    assert.match(source, /\$_SERVER\['REQUEST_METHOD'\] !== 'POST'/);
    assert.match(source, /GK_GAMEBIBLE_LEGACY_SAVE_ENABLED/);
    assert.match(source, /REMOTE_USER/);
    assert.match(source, /GK_GAMEBIBLE_LEGACY_SAVE_TOKEN/);
    assert.match(source, /flock/);
    assert.match(source, /rename/);
    assert.match(source, /game_bible_node\.save/);
    assert.doesNotMatch(source, /password\s*=|secret\s*=|token\s*=\s*['"][^'"]{8,}/i);
  });
});
