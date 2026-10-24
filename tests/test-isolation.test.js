import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { createIsolatedRuntime, requireIsolatedMode, withIsolatedRuntime } from "../scripts/lib/test-isolation.js";
import { assertIsolatedNetwork, assertIsolatedStorage } from "../src/server/storage-policy.js";
import { loadEnvFile } from "../src/server/env.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function digest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

test("testmodus is fail-closed", function () {
  const previous = process.env.GK_TEST_ISOLATED;
  delete process.env.GK_TEST_ISOLATED;
  try {
    assert.throws(() => requireIsolatedMode(), { code: "TEST_ISOLATION_REQUIRED" });
  } finally {
    if (previous === undefined) delete process.env.GK_TEST_ISOLATED;
    else process.env.GK_TEST_ISOLATED = previous;
  }
});

test("normale storage en publieke host worden geweigerd", function () {
  requireIsolatedMode();
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gk-policy-"));
  const previousRoot = process.env.GK_TEST_ROOT;
  process.env.GK_TEST_ROOT = testRoot;
  try {
    assert.throws(() => assertIsolatedStorage({
      rootDir,
      databasePath: path.join(rootDir, "storage", "gk-real-node-editor.sqlite"),
      assetsPath: path.join(testRoot, "assets")
    }), { code: "TEST_PATH_OUTSIDE_ROOT" });
    assert.throws(() => assertIsolatedNetwork({ host: "0.0.0.0", port: 3001 }), { code: "PUBLIC_TEST_HOST_FORBIDDEN" });
  } finally {
    if (previousRoot === undefined) delete process.env.GK_TEST_ROOT;
    else process.env.GK_TEST_ROOT = previousRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
});

test("sentinels in normale checkoutopslag blijven byte-identiek", async function () {
  requireIsolatedMode();
  const simulatedCheckout = fs.mkdtempSync(path.join(os.tmpdir(), "gk-disposable-checkout-"));
  const storageSentinel = path.join(simulatedCheckout, "storage", "f1-isolation-sentinel.bin");
  const assetSentinel = path.join(simulatedCheckout, "assets", "f1-isolation-sentinel.bin");
  const bytes = crypto.randomBytes(96);
  fs.mkdirSync(path.dirname(storageSentinel), { recursive: true });
  fs.mkdirSync(path.dirname(assetSentinel), { recursive: true });
  fs.writeFileSync(storageSentinel, bytes);
  fs.writeFileSync(assetSentinel, bytes);
  const beforeStorage = digest(storageSentinel);
  const beforeAsset = digest(assetSentinel);
  try {
    const runtime = await createIsolatedRuntime(simulatedCheckout, "sentinel");
    try {
      const db = new DatabaseSync(runtime.databasePath);
      db.exec("CREATE TABLE proof (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO proof(value) VALUES ('isolated');");
      db.close();
      fs.mkdirSync(path.join(runtime.assetsPath, "uploads"), { recursive: true });
      fs.writeFileSync(path.join(runtime.assetsPath, "uploads", "proof.bin"), bytes);
      assert.notEqual(path.resolve(runtime.databasePath), path.resolve(storageSentinel));
      assert.ok(fs.existsSync(path.join(runtime.assetsPath, "uploads", "proof.bin")));
    } finally {
      runtime.cleanup();
    }
    assert.equal(digest(storageSentinel), beforeStorage);
    assert.equal(digest(assetSentinel), beforeAsset);
  } finally {
    fs.rmSync(simulatedCheckout, { recursive: true, force: true });
  }
});

test("tijdelijke root wordt ook na een testfout opgeruimd", async function () {
  requireIsolatedMode();
  let temporaryRoot = "";
  await assert.rejects(async function () {
    await withIsolatedRuntime(rootDir, "cleanup-error", async function (runtime) {
      temporaryRoot = runtime.rootDir;
      fs.writeFileSync(path.join(runtime.assetsPath, "partial.bin"), "partial");
      throw new Error("opzettelijke testfout");
    });
  }, /opzettelijke testfout/);
  assert.equal(fs.existsSync(temporaryRoot), false);
});

test("geïsoleerde server laadt de .env van de checkout niet", function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gk-envfile-"));
  try {
    fs.writeFileSync(path.join(dir, ".env"), "ALLOWED_ORIGINS=https://productie.invalid\nCOOKIE_SECURE=true\n");
    const isolatedEnv = { GK_TEST_ISOLATED: "1" };
    assert.equal(loadEnvFile(dir, isolatedEnv), false);
    assert.equal(isolatedEnv.ALLOWED_ORIGINS, undefined);
    assert.equal(isolatedEnv.COOKIE_SECURE, undefined);
    const operatorEnv = {};
    assert.equal(loadEnvFile(dir, operatorEnv), true);
    assert.equal(operatorEnv.ALLOWED_ORIGINS, "https://productie.invalid");
    assert.equal(operatorEnv.COOKIE_SECURE, "true");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
