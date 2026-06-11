import { existsSync, lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredDirs = [
  "apps/editor-web",
  "apps/game-web",
  "apps/api-server",
  "apps/realtime-gateway",
  "apps/world-service",
  "apps/publish-service",
  "apps/asset-worker",
  "packages/schemas",
  "packages/node-engine",
  "packages/node-types",
  "packages/net-protocol",
  "packages/shared-ui",
  "packages/shared-utils",
  "packages/renderer-runtime",
  "packages/audio-runtime",
  "db",
  "ops",
  "tests",
  "docs/architecture"
];

const forbiddenPatterns = [
  /\.glb$/i,
  /\.env$/i,
  /Blacksmit/i,
  /Taverne/i,
  /Wizard/i
];

const sourceRoots = ["apps", "packages"];
const ignoredDirectoryNames = new Set([
  ".cache",
  ".next",
  ".turbo",
  ".vite",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const failures = [];

for (const dir of requiredDirs) {
  if (!existsSync(dir)) {
    failures.push(`Missing required directory: ${dir}`);
  }
}

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const linkStats = lstatSync(path);
    if (linkStats.isSymbolicLink()) {
      continue;
    }

    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }

    if (!stats.isFile()) {
      continue;
    }

    const size = stats.size;
    if (size > 12_000) {
      failures.push(`Starter file is too large for Fase 3 skeleton: ${path}`);
    }

    const content = readFileSync(path, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(path) || pattern.test(content)) {
        failures.push(`Forbidden content or asset reference in ${path}: ${pattern}`);
      }
    }
  }
};

for (const root of sourceRoots) {
  if (existsSync(root)) {
    walk(root);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("workspace boundaries ok");
