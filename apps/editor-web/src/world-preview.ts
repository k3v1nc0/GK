export interface EmptyWorldPreviewState {
  readonly id: "viewport-world-preview";
  readonly title: "Viewport / World Preview";
  readonly status: "empty";
  readonly message: "Empty world preview";
  readonly waitsFor: "published-world-node-data";
  readonly worldObjects: readonly never[];
  readonly assetReferences: readonly never[];
  readonly audioReferences: readonly never[];
  readonly camera: null;
  readonly lighting: null;
  readonly acceptsDummyContent: false;
  readonly acceptsConcreteGameContent: false;
}

export function createEmptyWorldPreviewState(): EmptyWorldPreviewState {
  return {
    id: "viewport-world-preview",
    title: "Viewport / World Preview",
    status: "empty",
    message: "Empty world preview",
    waitsFor: "published-world-node-data",
    worldObjects: [],
    assetReferences: [],
    audioReferences: [],
    camera: null,
    lighting: null,
    acceptsDummyContent: false,
    acceptsConcreteGameContent: false
  };
}
