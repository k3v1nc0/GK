"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const puppeteer = require("puppeteer");
const { FileHandler } = require("@shopify/screenshot-glb/dist/file-handler.js");
const { FileServer } = require("@shopify/screenshot-glb/dist/file-server.js");
const { htmlTemplate } = require("@shopify/screenshot-glb/dist/html-template.js");
const { prepareAppOptions } = require("@shopify/screenshot-glb/dist/prepare-app-options.js");

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});

async function main() {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) {
    throw new Error("Usage: generate-glb-thumbnail.cjs <input.glb> <output.png>");
  }

  const fileHandler = new FileHandler();
  const localServer = new FileServer(fileHandler.fileDirectory);
  let options;
  await localServer.start();
  try {
    options = await prepareAppOptions({
      localServerPort: localServer.port,
      fileHandler: fileHandler,
      argv: buildArgv(inputPath, outputPath)
    });
    await captureScreenshot(options);
  } finally {
    await localServer.stop().catch(function () {});
    await fileHandler.destroy().catch(function () {});
  }
}

function buildArgv(inputPath, outputPath) {
  const thumbnailSize = Number(process.env.GLB_THUMBNAIL_SIZE || 768);
  const timeout = Number(process.env.GLB_THUMBNAIL_TIMEOUT || 30000);
  const modelViewerAttributes = process.env.GLB_THUMBNAIL_MODEL_VIEWER_ATTRIBUTES || "environment-image=neutral&exposure=0.92&shadow-intensity=1";
  const modelViewerVersion = process.env.GLB_THUMBNAIL_MODEL_VIEWER_VERSION || "1.9";
  const modelViewerPath = process.env.GLB_THUMBNAIL_MODEL_VIEWER_PATH || "";
  const color = process.env.GLB_THUMBNAIL_COLOR || "";
  return {
    input: inputPath,
    output: outputPath,
    width: thumbnailSize,
    height: thumbnailSize,
    timeout: timeout,
    color: color,
    model_viewer_attributes: modelViewerAttributes,
    model_viewer_version: modelViewerPath ? "" : modelViewerVersion,
    model_viewer_path: modelViewerPath
  };
}

async function captureScreenshot(options) {
  const browserT0 = performance.now();
  const { modelViewerUrl, width, height, outputPath, debug, quality, timeout, devicePixelRatio, formatExtension } = options;
  const screenshotTimeoutInSec = timeout / 1000;
  const headless = !debug;
  const args = [
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-setuid-sandbox",
    "--no-zygote",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader"
  ];
  if (headless) {
    args.push("--single-process");
  } else {
    args.push("--start-maximized");
  }

  const browser = await puppeteer.launch({
    args: args,
    defaultViewport: {
      width: width,
      height: height,
      deviceScaleFactor: devicePixelRatio
    },
    headless: headless
  });
  try {
    const page = await browser.newPage();
    page.on("error", function (error) {
      console.log("🚨  Page Error: " + error);
    });
    page.on("console", async function (message) {
      const values = await Promise.all(message.args().map(function (arg) { return arg.jsonValue(); }));
      if (values.length) {
        console.log("➡️", ...values);
      }
    });

    const browserT1 = performance.now();
    console.log("🚀  Launched browser (" + timeDelta(browserT0, browserT1) + "s)");

    const contentT0 = performance.now();
    const data = htmlTemplate(Object.assign({}, options, { modelViewerUrl: modelViewerUrl }));
    await page.setContent(data, {
      waitUntil: ["domcontentloaded", "networkidle0"]
    });
    const contentT1 = performance.now();
    console.log("🗺  Loading template to DOMContentLoaded (" + timeDelta(contentT0, contentT1) + "s)");

    const renderT0 = performance.now();
    const evaluateError = await page.evaluate(async function (maxTimeInSec) {
      const modelBecomesReady = new Promise(function (resolve, reject) {
        let timeoutId;
        if (maxTimeInSec > 0) {
          timeoutId = setTimeout(function () {
            reject(new Error("Stop capturing screenshot after " + maxTimeInSec + " seconds"));
          }, maxTimeInSec * 1000);
        }
        const modelViewer = document.getElementById("snapshot-viewer");
        modelViewer.addEventListener("poster-dismissed", function () {
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                if (maxTimeInSec > 0) {
                  clearTimeout(timeoutId);
                }
                resolve();
              });
            });
          });
        }, { once: true });
      });
      try {
        await modelBecomesReady;
        return null;
      } catch (error) {
        return error.message;
      }
    }, screenshotTimeoutInSec);
    const renderT1 = performance.now();
    console.log("🖌  Rendering screenshot of model (" + timeDelta(renderT0, renderT1) + "s)");
    if (evaluateError) {
      throw new Error("Evaluate error: " + evaluateError);
    }

    const screenshotT0 = performance.now();
    const captureOptions = {
      quality: quality * 100.0,
      type: formatExtension,
      path: outputPath,
      omitBackground: true
    };
    if (formatExtension === "png") {
      delete captureOptions.quality;
    }
    await page.screenshot(captureOptions);
    const screenshotT1 = performance.now();
    console.log("🖼  Captured screenshot (" + timeDelta(screenshotT0, screenshotT1) + "s)");
  } finally {
    await browser.close().catch(function () {});
  }
}

function timeDelta(start, end) {
  return ((end - start) / 1000).toPrecision(3);
}
