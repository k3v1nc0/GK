#!/usr/bin/env node

const RUNTIME_GAME_CORE_SELECTOR = "[data-runtime-game-core='phase-17']";

const report = {
  status: "fail",
  url: null,
  runtimeGameCore: "fail",
  assetRequests: 0,
  consoleErrors: 0,
  pageErrors: 0,
  reason: null
};

let browser;

try {
  const gameUrl = resolveGameSmokeUrl();
  report.url = gameUrl || null;

  if (!gameUrl) {
    report.status = "skipped";
    report.runtimeGameCore = "skipped";
    report.reason = "GK_GAME_FRONT_DOOR_URL or GK_GAME_WEB_ORIGIN is not set; runtime game core smoke was skipped.";
  } else {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    await runRuntimeGameCoreSmoke(browser, gameUrl);
    report.status = "ok";
    report.runtimeGameCore = "ok";
  }
} catch (error) {
  report.status = "fail";
  report.reason = redact(error instanceof Error ? error.message : String(error));
} finally {
  if (browser) {
    await browser.close();
  }
}

printReport(report);

if (report.status === "fail") {
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

  throw new Error("Playwright is not installed. Install @playwright/test and Chromium before running this smoke.");
}

async function runRuntimeGameCoreSmoke(browserInstance, gameUrl) {
  const pageState = createPageState();
  const context = await browserInstance.newContext();
  const page = await context.newPage();
  observePage(page, pageState);

  try {
    const response = await page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response || response.status() >= 500 || response.status() === 404) {
      throw new Error(`Runtime Game Core URL check failed with status ${response?.status() ?? "unknown"}.`);
    }

    const runtimeGameCore = page.locator(RUNTIME_GAME_CORE_SELECTOR).first();
    if (await runtimeGameCore.count() === 0) {
      throw new Error("Runtime Game Core marker unavailable.");
    }

    await runtimeGameCore.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForFunction(() => {
      const core = document.querySelector("[data-runtime-game-core='phase-17']");
      return core?.getAttribute("data-runtime-game-uses-editor-routes") === "false"
        && core?.getAttribute("data-runtime-game-uses-draft-data") === "false"
        && core?.getAttribute("data-runtime-game-loads-assets") === "false"
        && core?.getAttribute("data-runtime-game-fetches-bytes") === "false"
        && core?.getAttribute("data-runtime-game-hardcodes-content") === "false";
    }, undefined, { timeout: 5_000 });

    const state = await page.evaluate(() => {
      const core = document.querySelector("[data-runtime-game-core='phase-17']");
      const model = document.querySelector("#runtime-game-core-model");
      const text = document.body.textContent ?? "";
      const html = document.body.innerHTML;

      return {
        marker: Boolean(core),
        lifecycle: core?.getAttribute("data-runtime-game-lifecycle") ?? "",
        bootable: core?.getAttribute("data-runtime-game-bootable") ?? "",
        blocked: core?.getAttribute("data-runtime-game-blocked") ?? "",
        saveLoad: core?.getAttribute("data-runtime-game-save-load") ?? "",
        usesEditorRoutes: core?.getAttribute("data-runtime-game-uses-editor-routes") ?? "",
        usesDraftData: core?.getAttribute("data-runtime-game-uses-draft-data") ?? "",
        loadsAssets: core?.getAttribute("data-runtime-game-loads-assets") ?? "",
        fetchesBytes: core?.getAttribute("data-runtime-game-fetches-bytes") ?? "",
        hardcodesContent: core?.getAttribute("data-runtime-game-hardcodes-content") ?? "",
        modelText: model?.textContent ?? "",
        editorRouteMentioned: text.includes("/editor/") || html.includes("/auth/editor"),
        assetRouteMentioned: /\/assets\//i.test(html) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|&|\"|'|<|$)/i.test(html),
        rendererApiMentioned: /drawImage|fillRect|stroke\(|requestAnimationFrame|THREE\.|new Scene|new Mesh/.test(html)
      };
    });

    if (
      !state.marker
      || state.usesEditorRoutes !== "false"
      || state.usesDraftData !== "false"
      || state.loadsAssets !== "false"
      || state.fetchesBytes !== "false"
      || state.hardcodesContent !== "false"
      || state.editorRouteMentioned
      || state.assetRouteMentioned
      || state.rendererApiMentioned
      || state.modelText.includes("/editor/")
      || state.modelText.includes("/assets/")
    ) {
      throw new Error("Runtime Game Core failed no-editor/no-draft/no-asset/no-render checks.");
    }

    if (!["contract-ready", "available", "blocked"].includes(state.saveLoad)) {
      throw new Error(`Runtime Game Core save/load state is invalid: ${state.saveLoad}.`);
    }

    if (pageState.forbiddenAssetRequests.length > 0) {
      throw new Error(`Runtime Game Core triggered forbidden asset requests: ${pageState.forbiddenAssetRequests.join(", ")}.`);
    }

    if (pageState.consoleErrors > 0 || pageState.pageErrors > 0) {
      throw new Error("Runtime Game Core browser smoke saw console or page errors.");
    }

    report.assetRequests = pageState.forbiddenAssetRequests.length;
    report.consoleErrors = pageState.consoleErrors;
    report.pageErrors = pageState.pageErrors;
  } finally {
    await context.close();
  }
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
    if (isForbiddenAssetRequest(url)) {
      state.forbiddenAssetRequests.push(url);
    }
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (isForbiddenAssetRequest(url) && !state.forbiddenAssetRequests.includes(url)) {
      state.forbiddenAssetRequests.push(url);
    }
  });
}

function createPageState() {
  return {
    consoleErrors: 0,
    pageErrors: 0,
    forbiddenAssetRequests: []
  };
}

function printReport(result) {
  const lines = [
    "runtime game core browser smoke report",
    `status: ${result.status}`,
    `url: ${result.url ?? "skipped"}`,
    `runtime game core: ${result.runtimeGameCore}`,
    `asset load requests: ${result.assetRequests}`,
    `console errors count: ${result.consoleErrors}`,
    `page errors count: ${result.pageErrors}`
  ];

  if (result.reason) {
    lines.push(`reason: ${result.reason}`);
  }

  console.log(lines.join("\n"));
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

function stripTrailingSlash(value) {
  return value.replace(/\/$/, "");
}

function isForbiddenAssetRequest(value) {
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
