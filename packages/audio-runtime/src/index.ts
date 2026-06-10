import type { PublishedNodeEnvelope } from "@gk/schemas";

export type AudioPrimitiveKind = "music" | "ambience" | "sfx" | "ui" | "voice";

export interface AudioRuntimeBinding {
  readonly kind: AudioPrimitiveKind;
  readonly sourceNode: PublishedNodeEnvelope;
}

export interface AudioRuntime {
  bindPublishedNode(node: PublishedNodeEnvelope, kind: AudioPrimitiveKind): AudioRuntimeBinding;
}

export function createAudioRuntime(): AudioRuntime {
  return {
    bindPublishedNode(sourceNode, kind) {
      return { kind, sourceNode };
    }
  };
}

