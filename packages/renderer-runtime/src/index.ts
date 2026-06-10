import type { PublishedNodeEnvelope } from "@gk/schemas";

export type RenderPrimitiveKind = "scene" | "mesh" | "camera" | "light" | "hud";

export interface RenderPrimitive {
  readonly kind: RenderPrimitiveKind;
  readonly sourceNode: PublishedNodeEnvelope;
}

export interface RendererRuntime {
  acceptPublishedNode(node: PublishedNodeEnvelope, kind: RenderPrimitiveKind): RenderPrimitive;
}

export function createRendererRuntime(): RendererRuntime {
  return {
    acceptPublishedNode(sourceNode, kind) {
      return { kind, sourceNode };
    }
  };
}

