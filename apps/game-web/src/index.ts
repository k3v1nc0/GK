import type { PublishedNodeEnvelope } from "@gk/schemas";
import { createAudioRuntime } from "@gk/audio-runtime";
import { createRendererRuntime } from "@gk/renderer-runtime";

export * from "./auth-client.js";

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