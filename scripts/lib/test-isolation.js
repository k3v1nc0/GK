import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { assertIsolatedNetwork, assertIsolatedStorage } from "../../src/server/storage-policy.js";

export function requireIsolatedMode() {
  if (process.env.GK_TEST_ISOLATED !== "1") {
    const error = new Error("Veilige testmodus is verplicht: voer uit met GK_TEST_ISOLATED=1.");
    error.code = "TEST_ISOLATION_REQUIRED";
    throw error;
  }
}

export async function reserveLoopbackPort() {
  return await new Promise(function (resolve, reject) {
    const probe = net.createServer();
    probe.unref();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", function () {
      const address = probe.address();
      const port = address && typeof address === "object" ? address.port : 0;
      probe.close(function (error) {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

export async function createIsolatedRuntime(rootDir, label = "run") {
  requireIsolatedMode();
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "gk-" + label + "-"));
  const databasePath = path.join(testRoot, "db", "gk-test.sqlite");
  const assetsPath = path.join(testRoot, "assets");
  const host = "127.0.0.1";
  const port = await reserveLoopbackPort();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.mkdirSync(assetsPath, { recursive: true });
  const previousTestRoot = process.env.GK_TEST_ROOT;
  process.env.GK_TEST_ROOT = testRoot;
  try {
    assertIsolatedStorage({ rootDir, databasePath, assetsPath });
    assertIsolatedNetwork({ host, port });
  } catch (error) {
    if (previousTestRoot === undefined) delete process.env.GK_TEST_ROOT;
    else process.env.GK_TEST_ROOT = previousTestRoot;
    fs.rmSync(testRoot, { recursive: true, force: true });
    throw error;
  }
  return {
    rootDir: testRoot,
    databasePath,
    assetsPath,
    host,
    port,
    env(extra = {}) {
      return Object.assign({}, process.env, extra, {
        GK_TEST_ISOLATED: "1",
        GK_TEST_ROOT: testRoot,
        DATABASE_PATH: databasePath,
        ASSETS_PATH: assetsPath,
        HOST: host,
        PORT: String(port)
      });
    },
    cleanup() {
      fs.rmSync(testRoot, { recursive: true, force: true });
      if (previousTestRoot === undefined) delete process.env.GK_TEST_ROOT;
      else process.env.GK_TEST_ROOT = previousTestRoot;
    }
  };
}

export async function withIsolatedRuntime(rootDir, label, callback) {
  const runtime = await createIsolatedRuntime(rootDir, label);
  try {
    return await callback(runtime);
  } finally {
    runtime.cleanup();
  }
}
