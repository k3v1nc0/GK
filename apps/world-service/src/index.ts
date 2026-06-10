import { NodeRegistry } from "@gk/node-engine";

export interface WorldServiceBoundary {
  readonly registry: NodeRegistry;
  readonly reads: "published-world-node-data";
}

export function createWorldServiceBoundary(): WorldServiceBoundary {
  return {
    registry: new NodeRegistry(),
    reads: "published-world-node-data"
  };
}

