import { pathToFileURL } from "node:url";

import type { PublishedNodeEnvelope } from "@gk/schemas";
import { createAudioRuntime } from "@gk/audio-runtime";
import { createRendererRuntime } from "@gk/renderer-runtime";

import { startGameServer } from "./http-server.js";

export * from "./auth-client.js";
export * from "./http-server.js";
export * from "./runtime-client-shell.js";
export * from "./runtime-projection-client.js";
export * from "./runtime-render-surface.js";
export * from "./runtime-scene-assembly.js";

export interface GameWebRuntimeBoundary {
  readonly rendererReady: boolean;
  readonly audioReady: boolean;
  readonly contentSource: "published-node-data";
}

export function createGameWebBoundary(nodes: readonly PublishedNodeEnvelope[]): GameWebRuntimeBoundary {
  const renderer = createRendererRuntime();
  const audio = createAudioRuntime();
  const firstNode = nodes[0];

  if (firstNode) {
    renderer.acceptPublishedNode(firstNode, "scene");
    audio.bindPublishedNode(firstNode, "sfx");
  }

  return {
    rendererReady: true,
    audioReady: true,
    contentSource: "published-node-data"
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startGameServer();
}
