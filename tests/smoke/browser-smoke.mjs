#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDITOR_PANEL_IDS = ["publish-flow-panel", "runtime-projection-panel"];
const EDITOR_PANEL_TITLES = new Map([
  ["publish-flow-panel", "Publish Flow"],
  ["runtime-projection-panel", "Runtime Projection"]
]);
const RUNTIME_CLIENT_SHELL_SELECTOR = "[data-runtime-client-shell='phase-12']";
const RUNTIME_RENDER_SURFACE_SELECTOR = "[data-runtime-render-surface='phase-13']";
const RUNTIME_SCENE_ASSEMBLY_SELECTOR = "[data-runtime-scene-assembly='phase-14']";

const args = new Set(process.argv.slice(2));
const runEditor = !args.has("--game");
const runGame = !args.has("--editor");
const screenshotEnabled = process.env.GK_BROWSER_SMOKE_SCREENSHOT === "1";
const traceEnabled = process.env.GK_BROWSER_SMOKE_TRACE === "1";
const artifactDir = process.env.GK_BROWSER_SMOKE_ARTIFACT_DIR ?? join(tmpdir(), "gk-browser-smoke", timestampSlug());

const report = {
  editor: skipped("not requested"),
  game: skipped("not requested"),
  artifactDir: screenshotEnabled || traceEnabled ? artifactDir : null
};

let browser;
let harnessFailure = null;

try {
  const { chromium } = await loadPlaywright();

  if (screenshotEnabled || traceEnabled) {
    await mkdir(artifactDir, { recursive: true });
  }

  browser = await chromium.launch({ headless: true });

  if (runEditor) {
    report.editor = await runEditorSmoke(browser);
  }

  if (runGame) {
    report.game = await runGameSmoke(browser);
  }
} catch (error) {
  harnessFailure = redact(error instanceof Error ? error.message : String(error));
} finally {
  if (browser) {
    await browser.close();
  }
}

printReport(report, harnessFailure);

if (harnessFailure || report.editor.status === "fail" || report.game.status === "fail") {
  process.exitCode = 1;
}

async function loadPlaywright() {
  const candidates = ["@playwright/test", "playwright"];

  for (const candidate of candidates) {
    try {
      const module = await import(candidate);
      if (module.chromium) {
        return module;
      }
    } catch {
      // Try the next supported package name.
    }
  }

  throw new Error(
    "Playwright is not installed. Install @playwright/test and Chromium on the server before running pnpm smoke:browser."
  );
}

async function runEditorSmoke(browserInstance) {
  const pageState = createPageState();
  const editorOrigin = stripTrailingSlash(process.env.GK_EDITOR_WEB_ORIGIN ?? "http://127.0.0.1:3002");
  const editorUrl = new URL(process.env.GK_EDITOR_PATH ?? "/editor/", `${editorOrigin}/`).href;
  const credentials = readEditorCredentials();

  if (!credentials) {
    return failed(
      "Missing editor credentials. Source /etc/gk/secrets/initial-editor-admin.env or /etc/gk/secrets/smoke-users.env before running the smoke."
    );
  }

  const context = await browserInstance.newContext({ baseURL: editorOrigin });
  const page = await context.newPage();
  observePage(page, pageState);

  let screenshotPath = null;
  let tracePath = null;

  try {
    const response = await page.goto(editorUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response || response.status() >= 500 || response.status() === 404) {
      throw new Error(`Editor URL check failed with status ${response?.status() ?? "unknown"}.`);
    }

    const loginVisible = await page.locator("[data-editor-login='required']").isVisible({ timeout: 10_000 });
    if (!loginVisible) {
      throw new Error("Editor login-required shell marker was not visible.");
    }

    await page.fill("#editor-email", credentials.email);
    await page.fill("#editor-password", credentials.password);
    await Promise.all([
      page.locator("#editor-view:not([hidden])").waitFor({ timeout: 15_000 }),
      page.click("#editor-login-form button[type='submit']")
    ]);

    await clearLoginFormValues(page);

    const session = await page.evaluate(async () => {
      const response = await fetch("/auth/editor/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const body = await response.json().catch(() => null);
      return {
        ok: response.ok,
        status: response.status,
        authenticated: body?.authenticated === true,
        roles: Array.isArray(body?.roles) ? body.roles : []
      };
    });

    if (!session.ok || !session.authenticated || !session.roles.includes("editor_admin")) {
      throw new Error(`Editor session check failed with status ${session.status}.`);
    }

    const shell = await page.evaluate(async () => {
      const response = await fetch("/editor/shell.json", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      const body = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, body };
    });

    if (!shell.ok || !shell.body) {
      throw new Error(`Editor shell model check failed with status ${shell.status}.`);
    }

    const dockTabs = Array.isArray(shell.body?.layout?.dockTabs) ? shell.body.layout.dockTabs : [];
    const missingPanelIds = EDITOR_PANEL_IDS.filter((panelId) => !dockTabs.includes(panelId));
    if (missingPanelIds.length > 0) {
      throw new Error(`Editor shell model is missing panel IDs: ${missingPanelIds.join(", ")}.`);
    }

    const missingPanelTitles = [];
    for (const panelId of EDITOR_PANEL_IDS) {
      const title = EDITOR_PANEL_TITLES.get(panelId);
      if (title && !(await page.getByText(title, { exact: true }).first().isVisible())) {
        missingPanelTitles.push(title);
      }
    }

    if (missingPanelTitles.length > 0) {
      throw new Error(`Editor DOM is missing visible panel titles: ${missingPanelTitles.join(", ")}.`);
    }

    if (pageState.consoleErrors > 0 || pageState.pageErrors > 0) {
      throw new Error("Editor browser smoke saw console or page errors.");
    }

    if (traceEnabled) {
      tracePath = join(artifactDir, "editor-after-login.trace.zip");
      await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
      await page.locator("#editor-view:not([hidden])").waitFor({ timeout: 5_000 });
      await page.mouse.move(1, 1);
      await context.tracing.stop({ path: tracePath });
    }

    if (screenshotEnabled) {
      screenshotPath = join(artifactDir, "editor-after-login.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    return ok({
      url: editorUrl,
      auth: "ok",
      panels: "ok",
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors,
      screenshotPath,
      tracePath
    });
  } catch (error) {
    return failed(redact(error instanceof Error ? error.message : String(error)), {
      url: editorUrl,
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors
    });
  } finally {
    await context.close();
  }
}

async function runGameSmoke(browserInstance) {
  const pageState = createPageState();
  const gameUrl = resolveGameSmokeUrl();

  if (!gameUrl) {
    return skipped("GK_GAME_FRONT_DOOR_URL or GK_GAME_WEB_ORIGIN is not set; game browser smoke was skipped.");
  }

  const context = await browserInstance.newContext();
  const page = await context.newPage();
  observePage(page, pageState);

  let screenshotPath = null;
  let tracePath = null;

  try {
    const response = await page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response || response.status() >= 500 || response.status() === 404) {
      throw new Error(`Game URL check failed with status ${response?.status() ?? "unknown"}.`);
    }

    const gameLoginResult = await tryGameLogin(page);
    const runtimeShellResult = await tryRuntimeShellSmoke(page);
    const runtimeRenderSurfaceResult = await tryRuntimeRenderSurfaceSmoke(page, pageState);
    const runtimeSceneAssemblyResult = await tryRuntimeSceneAssemblySmoke(page, pageState);

    if (pageState.forbiddenAssetRequests.length > 0) {
      throw new Error(`Game browser smoke saw forbidden runtime asset requests: ${pageState.forbiddenAssetRequests.join(", ")}.`);
    }

    if (pageState.consoleErrors > 0 || pageState.pageErrors > 0) {
      throw new Error("Game browser smoke saw console or page errors.");
    }

    if (traceEnabled) {
      tracePath = join(artifactDir, "game-reachability.trace.zip");
      await context.tracing.start({ screenshots: false, snapshots: true, sources: false });
      await page.locator("body").waitFor({ timeout: 5_000 });
      await page.mouse.move(1, 1);
      await context.tracing.stop({ path: tracePath });
    }

    if (screenshotEnabled) {
      screenshotPath = join(artifactDir, "game-reachability.png");
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    return ok({
      url: gameUrl,
      reachability: "ok",
      runtimeShell: runtimeShellResult,
      runtimeRenderSurface: runtimeRenderSurfaceResult,
      runtimeSceneAssembly: runtimeSceneAssemblyResult,
      gameLogin: gameLoginResult,
      assetRequests: pageState.forbiddenAssetRequests.length,
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors,
      screenshotPath,
      tracePath
    });
  } catch (error) {
    return failed(redact(error instanceof Error ? error.message : String(error)), {
      url: gameUrl,
      assetRequests: pageState.forbiddenAssetRequests.length,
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors
    });
  } finally {
    await context.close();
  }
}

async function tryRuntimeShellSmoke(page) {
  const shellMarker = page.locator(RUNTIME_CLIENT_SHELL_SELECTOR).first();

  if (await shellMarker.count() === 0) {
    return "skipped: runtime client shell marker unavailable";
  }

  await shellMarker.waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("[data-runtime-projection-status]").first().waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("[data-runtime-empty-state]").first().waitFor({ state: "visible", timeout: 5_000 });

  const shellState = await page.evaluate(() => {
    const marker = document.querySelector("[data-runtime-client-shell='phase-12']");
    const model = document.querySelector("#runtime-client-shell-model");
    return {
      marker: Boolean(marker),
      modelText: model?.textContent ?? "",
      editorRouteMentioned: document.body.textContent?.includes("/editor/") === true
    };
  });

  if (!shellState.marker || shellState.editorRouteMentioned || shellState.modelText.includes("/editor/")) {
    throw new Error("Runtime client shell marker failed or editor route leaked into game shell.");
  }

  return "ok";
}

async function tryRuntimeRenderSurfaceSmoke(page, pageState) {
  const renderSurface = page.locator(RUNTIME_RENDER_SURFACE_SELECTOR).first();

  if (await renderSurface.count() === 0) {
    throw new Error("Runtime render surface marker unavailable.");
  }

  await renderSurface.waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("[data-runtime-render-canvas]").first().waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("[data-runtime-render-safe-empty-state]").first().waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForFunction(() => {
    const surface = document.querySelector("[data-runtime-render-surface='phase-13']");
    return surface?.getAttribute("data-runtime-render-loads-assets") === "false"
      && surface?.getAttribute("data-runtime-render-renders-content") === "false";
  }, undefined, { timeout: 5_000 });

  const renderState = await page.evaluate(() => {
    const surface = document.querySelector("[data-runtime-render-surface='phase-13']");
    const model = document.querySelector("#runtime-render-surface-model");
    const safeEmpty = document.querySelector("[data-runtime-render-safe-empty-state]");
    const text = document.body.textContent ?? "";
    const html = document.body.innerHTML;

    return {
      marker: Boolean(surface),
      lifecycle: surface?.getAttribute("data-runtime-render-lifecycle") ?? "",
      loadsAssets: surface?.getAttribute("data-runtime-render-loads-assets") ?? "",
      rendersContent: surface?.getAttribute("data-runtime-render-renders-content") ?? "",
      safeEmptyVisible: Boolean(safeEmpty),
      modelText: model?.textContent ?? "",
      editorRouteMentioned: text.includes("/editor/") || html.includes("/auth/editor"),
      assetRouteMentioned: /\/assets\//i.test(html) || /\.(glb|gltf|mp3|wav|ogg)(\?|&|\"|'|<|$)/i.test(html)
    };
  });

  if (
    !renderState.marker
    || renderState.loadsAssets !== "false"
    || renderState.rendersContent !== "false"
    || !renderState.safeEmptyVisible
    || renderState.editorRouteMentioned
    || renderState.assetRouteMentioned
    || renderState.modelText.includes("/editor/")
    || renderState.modelText.includes("/assets/")
  ) {
    throw new Error("Runtime render surface failed safe empty/no-route/no-asset checks.");
  }

  if (pageState.forbiddenAssetRequests.length > 0) {
    throw new Error("Runtime render surface triggered a forbidden asset request.");
  }

  return "ok";
}

async function tryRuntimeSceneAssemblySmoke(page, pageState) {
  const sceneAssembly = page.locator(RUNTIME_SCENE_ASSEMBLY_SELECTOR).first();

  if (await sceneAssembly.count() === 0) {
    throw new Error("Runtime scene assembly marker unavailable.");
  }

  await sceneAssembly.waitFor({ state: "visible", timeout: 5_000 });
  await page.locator("[data-runtime-empty-scene-plan]").first().waitFor({ state: "visible", timeout: 5_000 });
  await page.waitForFunction(() => {
    const assembly = document.querySelector("[data-runtime-scene-assembly='phase-14']");
    return assembly?.getAttribute("data-runtime-scene-loads-assets") === "false"
      && assembly?.getAttribute("data-runtime-scene-renders-scene") === "false"
      && assembly?.getAttribute("data-runtime-scene-finalizes-roles") === "false";
  }, undefined, { timeout: 5_000 });

  const sceneState = await page.evaluate(() => {
    const assembly = document.querySelector("[data-runtime-scene-assembly='phase-14']");
    const model = document.querySelector("#runtime-scene-assembly-model");
    const emptyPlan = document.querySelector("[data-runtime-empty-scene-plan]");
    const text = document.body.textContent ?? "";
    const html = document.body.innerHTML;

    return {
      marker: Boolean(assembly),
      lifecycle: assembly?.getAttribute("data-runtime-scene-assembly-lifecycle") ?? "",
      loadsAssets: assembly?.getAttribute("data-runtime-scene-loads-assets") ?? "",
      rendersScene: assembly?.getAttribute("data-runtime-scene-renders-scene") ?? "",
      finalizesRoles: assembly?.getAttribute("data-runtime-scene-finalizes-roles") ?? "",
      emptyPlanVisible: Boolean(emptyPlan),
      modelText: model?.textContent ?? "",
      editorRouteMentioned: text.includes("/editor/") || html.includes("/auth/editor"),
      assetRouteMentioned: /\/assets\//i.test(html) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|&|\"|'|<|$)/i.test(html),
      rendererApiMentioned: /drawImage|fillRect|stroke\(|requestAnimationFrame|THREE\.|new Scene|new Mesh/.test(html)
    };
  });

  if (
    !sceneState.marker
    || sceneState.loadsAssets !== "false"
    || sceneState.rendersScene !== "false"
    || sceneState.finalizesRoles !== "false"
    || !sceneState.emptyPlanVisible
    || sceneState.editorRouteMentioned
    || sceneState.assetRouteMentioned
    || sceneState.rendererApiMentioned
    || sceneState.modelText.includes("/editor/")
    || sceneState.modelText.includes("/assets/")
  ) {
    throw new Error("Runtime scene assembly failed empty-plan/no-route/no-asset/no-render checks.");
  }

  if (pageState.forbiddenAssetRequests.length > 0) {
    throw new Error("Runtime scene assembly triggered a forbidden asset request.");
  }

  return "ok";
}

async function tryGameLogin(page) {
  const email = process.env.GK_SMOKE_GAME_EMAIL;
  const password = process.env.GK_SMOKE_GAME_PASSWORD;

  if (!email || !password) {
    return "skipped: missing GK_SMOKE_GAME_EMAIL/GK_SMOKE_GAME_PASSWORD";
  }

  const routeProbe = await page.evaluate(async () => {
    try {
      const response = await fetch("/auth/game/me", {
        credentials: "same-origin",
        headers: { Accept: "application/json" }
      });
      return { routeExists: response.status !== 404, status: response.status };
    } catch {
      return { routeExists: false, status: 0 };
    }
  });

  if (!routeProbe.routeExists) {
    return "skipped: game auth route unavailable";
  }

  const login = await page.evaluate(async ({ email: loginEmail, password: loginPassword }) => {
    const response = await fetch("/auth/game/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ email: loginEmail, password: loginPassword })
    });
    return { ok: response.ok, status: response.status };
  }, { email, password });

  if (!login.ok) {
    throw new Error(`Game login failed with status ${login.status}.`);
  }

  return "ok";
}

function readEditorCredentials() {
  const email = process.env.GK_SMOKE_EDITOR_EMAIL ?? process.env.GK_INITIAL_EDITOR_ADMIN_EMAIL;
  const password = process.env.GK_SMOKE_EDITOR_PASSWORD ?? process.env.GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD;

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

function observePage(page, state) {
  page.on("console", (message) => {
    if (message.type() === "error") {
      state.consoleErrors += 1;
    }
  });

  page.on("pageerror", () => {
    state.pageErrors += 1;
  });

  page.on("request", (request) => {
    const url = request.url();
    state.requestUrls.push(url);
    if (isForbiddenRenderAssetRequest(url)) {
      state.forbiddenAssetRequests.push(url);
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (isForbiddenRenderAssetRequest(url) && !state.forbiddenAssetRequests.includes(url)) {
      state.forbiddenAssetRequests.push(url);
    }
  });
}

function createPageState() {
  return {
    consoleErrors: 0,
    pageErrors: 0,
    requestUrls: [],
    forbiddenAssetRequests: []
  };
}

async function clearLoginFormValues(page) {
  await page.evaluate(() => {
    const email = document.querySelector("#editor-email");
    const password = document.querySelector("#editor-password");

    if (email instanceof HTMLInputElement) {
      email.value = "";
    }

    if (password instanceof HTMLInputElement) {
      password.value = "";
    }
  });
}

function printReport(result, harnessError) {
  const lines = [
    "browser smoke report",
    `editor browser smoke: ${result.editor.status}`,
    `game browser smoke: ${result.game.status}`,
    `url checks: ${statusSummary([result.editor, result.game], "url")}`,
    `panels: ${result.editor.details?.panels ?? (result.editor.status === "skipped" ? "skipped" : "fail")}`,
    `runtime shell: ${result.game.details?.runtimeShell ?? (result.game.status === "skipped" ? "skipped" : "fail")}`,
    `render surface: ${result.game.details?.runtimeRenderSurface ?? (result.game.status === "skipped" ? "skipped" : "fail")}`,
    `scene assembly: ${result.game.details?.runtimeSceneAssembly ?? (result.game.status === "skipped" ? "skipped" : "fail")}`,
    `asset load requests: ${sumCounts([result.editor, result.game], "assetRequests")}`,
    `console errors count: ${sumCounts([result.editor, result.game], "consoleErrors")}`,
    `page errors count: ${sumCounts([result.editor, result.game], "pageErrors")}`
  ];

  if (result.artifactDir) {
    lines.push(`artifact dir: ${result.artifactDir}`);
  }

  for (const [label, smoke] of [["editor", result.editor], ["game", result.game]]) {
    if (smoke.details?.screenshotPath) {
      lines.push(`${label} screenshot path: ${smoke.details.screenshotPath}`);
    }

    if (smoke.details?.tracePath) {
      lines.push(`${label} trace path: ${smoke.details.tracePath}`);
    }

    if (smoke.reason) {
      lines.push(`${label} reason: ${smoke.reason}`);
    }
  }

  if (harnessError) {
    lines.push(`harness error: ${harnessError}`);
  }

  console.log(lines.join("\n"));
}

function statusSummary(smokes, key) {
  const relevant = smokes.filter((smoke) => smoke.status !== "skipped");
  if (relevant.length === 0) {
    return "skipped";
  }

  return relevant.every((smoke) => smoke.status === "ok" && smoke.details?.[key]) ? "ok" : "fail";
}

function sumCounts(smokes, key) {
  return smokes.reduce((total, smoke) => total + Number(smoke.details?.[key] ?? 0), 0);
}

function resolveGameSmokeUrl() {
  if (process.env.GK_GAME_FRONT_DOOR_URL) {
    return process.env.GK_GAME_FRONT_DOOR_URL;
  }

  if (!process.env.GK_GAME_WEB_ORIGIN) {
    return "";
  }

  const origin = stripTrailingSlash(process.env.GK_GAME_WEB_ORIGIN);
  const shellPath = process.env.GK_GAME_SHELL_PATH ?? "/game/";
  return new URL(shellPath, `${origin}/`).href;
}

function ok(details) {
  return { status: "ok", details };
}

function failed(reason, details = {}) {
  return { status: "fail", reason, details };
}

function skipped(reason) {
  return { status: "skipped", reason };
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isForbiddenRenderAssetRequest(value) {
  return /\/assets\//i.test(value) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|#|$)/i.test(value);
}

function redact(value) {
  let output = String(value);
  const secretValues = [
    process.env.GK_INITIAL_EDITOR_ADMIN_EMAIL,
    process.env.GK_INITIAL_EDITOR_ADMIN_TEMP_PASSWORD,
    process.env.GK_SMOKE_EDITOR_EMAIL,
    process.env.GK_SMOKE_EDITOR_PASSWORD,
    process.env.GK_SMOKE_GAME_EMAIL,
    process.env.GK_SMOKE_GAME_PASSWORD
  ].filter(Boolean);

  for (const secret of secretValues) {
    output = output.split(secret).join("[redacted]");
  }

  return output;
}
