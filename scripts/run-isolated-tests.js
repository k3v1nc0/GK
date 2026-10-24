import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createIsolatedRuntime, requireIsolatedMode } from "./lib/test-isolation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  requireIsolatedMode();
  const runtime = await createIsolatedRuntime(rootDir, "unit-tests");
  const testFiles = fs.readdirSync(path.join(rootDir, "tests"))
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => path.join("tests", name));
  try {
    const code = await new Promise(function (resolve, reject) {
      const child = spawn(process.execPath, ["--test", ...testFiles], {
        cwd: rootDir,
        env: runtime.env(),
        stdio: "inherit"
      });
      child.once("error", reject);
      child.once("exit", function (exitCode, signal) {
        if (signal) reject(new Error("Testproces gestopt met signaal " + signal));
        else resolve(exitCode === null ? 1 : exitCode);
      });
    });
    process.exitCode = code;
  } finally {
    runtime.cleanup();
  }
}

main().catch(function (error) {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
