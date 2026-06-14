#!/usr/bin/env node
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const requiredDirs = [
  "apps/editor-web",
  "apps/game-web",
  "apps/api-server",
  "apps/realtime-gateway",
  "apps/world-service",
  "apps/publish-service",
  "apps/asset-worker",
  "packages/asset-library",
  "packages/schemas",
  "packages/node-types",
  "packages/node-engine",
  "packages/net-protocol",
  "packages/shared-ui",
  "packages/shared-utils",
  "packages/renderer-runtime",
  "packages/audio-runtime"
];
const forbiddenRootDirs = ["server", "client", "shared"];
const forbiddenPackageDirs = ["packages/server", "packages/client", "packages/shared"];
const forbiddenFiles = [
  "README/contract.md"
];
const protectedAssetDirs = [
  "apps/editor-web/public/assets",
  "apps/game-web/public/assets",
  "packages/renderer-runtime/assets",
  "packages/audio-runtime/assets"
];
const allowedAssetRegistryFiles = new Set([
  "docs/design/asset-register.md",
  "docs/design/audio-register.md"
]);
const ignoredDirectoryNames = new Set([
  ".git",
  ".next",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const maxSourceFileSize = 13_000;
const allowedLargeSourceFiles = new Set([
  "apps/api-server/src/editor-publish-routes.ts",
  "apps/api-server/src/runtime-projection-routes.ts",
  "packages/schemas/src/publish-flow.ts",
  "packages/schemas/src/publish-flow-validation.ts",
  "packages/schemas/src/runtime-asset-reference-planning.ts",
  "packages/schemas/src/runtime-asset-reference-planning-validation.ts",
  "packages/schemas/src/runtime-scene-assembly.ts",
  "packages/schemas/src/runtime-projection.ts",
  "packages/schemas/src/runtime-projection-validation.ts",
  "packages/schemas/src/world-camera-minimap.ts",
  "tests/phase9-world-camera-minimap.test.mjs",
  "tests/phase10-publish-flow.test.mjs",
  "tests/phase11-runtime-projection.test.mjs",
  "tests/phase14-runtime-scene-assembly.test.mjs",
  "tests/phase15-runtime-asset-reference-planning.test.mjs",
  "tests/smoke/browser-smoke.mjs"
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

    if (entry.isDirectory()) {
      walk(path);
      continue;
    }

    if (entry.isFile()) {
      checkFile(path);
    }
  }
};

const checkFile = (path) => {
  const normalized = path.replace(/\\/g, "/");

  if (forbiddenFiles.includes(normalized)) {
    failures.push(`Forbidden legacy file must not exist: ${normalized}`);
  }

  if (protectedAssetDirs.some((dir) => normalized.startsWith(`${dir}/`)) && !allowedAssetRegistryFiles.has(normalized)) {
    failures.push(`Asset mutation is not allowed in Git for protected asset path: ${normalized}`);
  }

  if (/\.(ts|tsx|js|mjs|jsx)$/.test(normalized) && !allowedLargeSourceFiles.has(normalized)) {
    const size = statSync(path).size;
    if (size > maxSourceFileSize) {
      failures.push(`Source file exceeds ${maxSourceFileSize} bytes and should be split: ${normalized}`);
    }
  }
};

for (const dir of forbiddenRootDirs) {
  if (existsSync(dir)) {
    failures.push(`Forbidden legacy root directory exists: ${dir}`);
  }
}

for (const dir of forbiddenPackageDirs) {
  if (existsSync(dir)) {
    failures.push(`Forbidden package namespace exists: ${dir}`);
  }
}

walk(".");

if (failures.length > 0) {
  console.error("Workspace boundary check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("workspace boundaries ok");
