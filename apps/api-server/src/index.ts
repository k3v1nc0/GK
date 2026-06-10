import type { ProtocolMessage } from "@gk/net-protocol";
import type { PublishedNodeEnvelope } from "@gk/schemas";

export * from "./auth-policy.js";
export * from "./auth-routes.js";

export interface ApiServerBoundary {
  readonly accepts: "editor-node-data";
  readonly publishes: "runtime-projections";
}

export function createPublishMessage(node: PublishedNodeEnvelope): ProtocolMessage<PublishedNodeEnvelope> {
  return {
    type: "editor.publish.request",
    payload: node
  };
}

export const apiServerBoundary: ApiServerBoundary = {
  accepts: "editor-node-data",
  publishes: "runtime-projections"
};