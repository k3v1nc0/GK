#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDITOR_PANEL_IDS = ["publish-flow-panel", "runtime-projection-panel"];
const EDITOR_PANEL_TITLES = new Map([
  ["publish-flow-panel", "Publish Flow"],
  ["runtime-projection-panel", "Runtime Projection"]
]);

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
  const gameUrl = process.env.GK_GAME_FRONT_DOOR_URL ?? process.env.GK_GAME_WEB_ORIGIN ?? "";

  if (!gameUrl) {
    return skipped("GK_GAME_FRONT_DOOR_URL is not set; game browser smoke is reachability-only and was skipped.");
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
      gameLogin: gameLoginResult,
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors,
      screenshotPath,
      tracePath
    });
  } catch (error) {
    return failed(redact(error instanceof Error ? error.message : String(error)), {
      url: gameUrl,
      consoleErrors: pageState.consoleErrors,
      pageErrors: pageState.pageErrors
    });
  } finally {
    await context.close();
  }
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
}

function createPageState() {
  return {
    consoleErrors: 0,
    pageErrors: 0
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
