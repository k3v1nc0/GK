import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

function candidateRoots() {
  const roots = [];
  const home = os.homedir();
  if (home) roots.push(path.join(home, ".npm", "_npx"));
  if (process.env.HOME) roots.push(path.join(process.env.HOME, ".npm", "_npx"));
  if (process.env.npm_config_cache) roots.push(path.join(process.env.npm_config_cache, "_npx"));
  roots.push(path.join(os.tmpdir(), ".npm", "_npx"));
  return Array.from(new Set(roots));
}

function findNode24Binary() {
  for (const root of candidateRoots()) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const candidate = path.join(root, entry.name, "node_modules", "node", "bin", "node");
      if (!fs.existsSync(candidate)) continue;
      try {
        const probe = spawnSync(candidate, ["-v"], { encoding: "utf8" });
        if (probe.status === 0 && String(probe.stdout || "").trim().startsWith("v24.")) {
          return candidate;
        }
      } catch {
        // Try the next candidate.
      }
    }
  }
  return null;
}

const [script, ...args] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/run-node24.js <script> [args...]");
  process.exit(1);
}

const node24 = findNode24Binary();
if (!node24) {
  console.error("Node 24 binary not found in npm cache. Run npm install with network access once, or install Node 24 locally.");
  process.exit(1);
}

const result = spawnSync(node24, [script, ...args], { stdio: "inherit", env: process.env });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);
