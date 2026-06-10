export type UiContentPolicy = "node-data-only";

export interface UiSurfaceDescriptor {
  readonly appId: string;
  readonly reads: readonly string[];
  readonly contentPolicy: UiContentPolicy;
}

export const SHARED_UI_CONTENT_POLICY: UiContentPolicy = "node-data-only";

export * from "./editor-layout.js";
