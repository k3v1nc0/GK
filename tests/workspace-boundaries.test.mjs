import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const apps = [
  "editor-web",
  "game-web",
  "api-server",
  "realtime-gateway",
  "world-service",
  "publish-service",
  "asset-worker"
];

const packages = [
  "schemas",
  "node-engine",
  "node-types",
  "net-protocol",
  "shared-ui",
  "shared-utils",
  "renderer-runtime",
  "audio-runtime"
];

describe("workspace skeleton", () => {
  it("keeps all required apps and packages present", () => {
    for (const app of apps) {
      assert.equal(existsSync(`apps/${app}/package.json`), true, `missing app ${app}`);
    }

    for (const pkg of packages) {
      assert.equal(existsSync(`packages/${pkg}/package.json`), true, `missing package ${pkg}`);
    }
  });

  it("keeps renderer and audio runtime split", () => {
    const renderer = JSON.parse(readFileSync("packages/renderer-runtime/package.json", "utf8"));
    const audio = JSON.parse(readFileSync("packages/audio-runtime/package.json", "utf8"));

    assert.equal(renderer.name, "@gk/renderer-runtime");
    assert.equal(audio.name, "@gk/audio-runtime");
  });

  it("keeps Nginx as candidate while Apache is the Fase 2 frontend path", () => {
    assert.equal(existsSync("ops/apache/gk-vhost.conf.template"), true);
    assert.equal(existsSync("ops/nginx/gk.conf.template"), true);
  });
});

