#!/usr/bin/env node

const RUNTIME_QUEST_SLICE_SELECTOR = "[data-runtime-quest-slice='phase-18']";
const FORBIDDEN_FIXTURE_CONTENT_PATTERN = /Fixture Quest Title|Fixture Reward Name|Fixture Unlock Name|Fixture Dialogue Line/i;

const report = {
  status: "fail",
  url: null,
  runtimeQuestSlice: "fail",
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
    report.runtimeQuestSlice = "skipped";
    report.reason = "GK_GAME_FRONT_DOOR_URL or GK_GAME_WEB_ORIGIN is not set; runtime quest slice smoke was skipped.";
  } else {
    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    await runRuntimeQuestSliceSmoke(browser, gameUrl);
    report.status = "ok";
    report.runtimeQuestSlice = "ok";
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

async function runRuntimeQuestSliceSmoke(browserInstance, gameUrl) {
  const pageState = createPageState();
  const context = await browserInstance.newContext();
  const page = await context.newPage();
  observePage(page, pageState);

  try {
    const response = await page.goto(gameUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    if (!response || response.status() >= 500 || response.status() === 404) {
      throw new Error(`Runtime Quest Slice URL check failed with status ${response?.status() ?? "unknown"}.`);
    }

    const runtimeQuestSlice = page.locator(RUNTIME_QUEST_SLICE_SELECTOR).first();
    if (await runtimeQuestSlice.count() === 0) {
      throw new Error("Runtime Quest Slice marker unavailable.");
    }

    await runtimeQuestSlice.waitFor({ state: "visible", timeout: 5_000 });
    await page.waitForFunction(() => {
      const slice = document.querySelector("[data-runtime-quest-slice='phase-18']");
      return slice?.getAttribute("data-runtime-quest-uses-editor-routes") === "false"
        && slice?.getAttribute("data-runtime-quest-uses-draft-data") === "false"
        && slice?.getAttribute("data-runtime-quest-loads-assets") === "false"
        && slice?.getAttribute("data-runtime-quest-fetches-bytes") === "false"
        && slice?.getAttribute("data-runtime-quest-hardcodes-content") === "false"
        && slice?.getAttribute("data-runtime-quest-non-visual-blocked") === "true"
        && slice?.getAttribute("data-runtime-quest-blocked-asset-roles") === "true";
    }, undefined, { timeout: 5_000 });

    const state = await page.evaluate((forbiddenFixtureContentPatternSource) => {
      const slice = document.querySelector("[data-runtime-quest-slice='phase-18']");
      const model = document.querySelector("#runtime-quest-slice-model");
      const text = document.body.textContent ?? "";
      const html = document.body.innerHTML;
      const forbiddenFixtureContentPattern = new RegExp(forbiddenFixtureContentPatternSource, "i");

      return {
        marker: Boolean(slice),
        lifecycle: slice?.getAttribute("data-runtime-quest-lifecycle") ?? "",
        blockedByMissingData: slice?.getAttribute("data-runtime-quest-blocked-missing-data") ?? "",
        blockedByAssetRoles: slice?.getAttribute("data-runtime-quest-blocked-asset-roles") ?? "",
        nonVisualBlocked: slice?.getAttribute("data-runtime-quest-non-visual-blocked") ?? "",
        usesEditorRoutes: slice?.getAttribute("data-runtime-quest-uses-editor-routes") ?? "",
        usesDraftData: slice?.getAttribute("data-runtime-quest-uses-draft-data") ?? "",
        loadsAssets: slice?.getAttribute("data-runtime-quest-loads-assets") ?? "",
        fetchesBytes: slice?.getAttribute("data-runtime-quest-fetches-bytes") ?? "",
        finalizesRoles: slice?.getAttribute("data-runtime-quest-finalizes-roles") ?? "",
        hardcodesContent: slice?.getAttribute("data-runtime-quest-hardcodes-content") ?? "",
        modelText: model?.textContent ?? "",
        editorRouteMentioned: text.includes("/editor/") || html.includes("/auth/editor"),
        assetRouteMentioned: /\/assets\//i.test(html) || /\.(glb|gltf|png|jpe?g|webp|gif|mp3|wav|ogg)(\?|&|\"|'|<|$)/i.test(html),
        rendererApiMentioned: /drawImage|fillRect|stroke\(|requestAnimationFrame|THREE\.|new Scene|new Mesh/.test(html),
        fixtureContentMentioned: forbiddenFixtureContentPattern.test(html)
      };
    }, FORBIDDEN_FIXTURE_CONTENT_PATTERN.source);

    if (
      !state.marker
      || state.lifecycle !== "blocked"
      || state.blockedByAssetRoles !== "true"
      || state.nonVisualBlocked !== "true"
      || state.usesEditorRoutes !== "false"
      || state.usesDraftData !== "false"
      || state.loadsAssets !== "false"
      || state.fetchesBytes !== "false"
      || state.finalizesRoles !== "false"
      || state.hardcodesContent !== "false"
      || state.editorRouteMentioned
      || state.assetRouteMentioned
      || state.rendererApiMentioned
      || state.fixtureContentMentioned
      || state.modelText.includes("/editor/")
      || state.modelText.includes("/assets/")
    ) {
      throw new Error("Runtime Quest Slice failed no-editor/no-draft/no-asset/no-render/no-hardcode checks.");
    }

    if (pageState.forbiddenAssetRequests.length > 0) {
      throw new Error(`Runtime Quest Slice triggered forbidden asset requests: ${pageState.forbiddenAssetRequests.join(", ")}.`);
    }

    if (pageState.consoleErrors > 0 || pageState.pageErrors > 0) {
      throw new Error("Runtime Quest Slice browser smoke saw console or page errors.");
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
    "runtime quest slice browser smoke report",
    `status: ${result.status}`,
    `url: ${result.url ?? "skipped"}`,
    `runtime quest slice: ${result.runtimeQuestSlice}`,
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
