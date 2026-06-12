import { pathToFileURL } from "node:url";

import type { ProtocolMessage } from "@gk/net-protocol";
import type { PublishedNodeEnvelope } from "@gk/schemas";

import { startApiServer } from "./http-server.js";

export * from "./auth-policy.js";
export * from "./auth-routes.js";
export * from "./editor-asset-library-routes.js";
export * from "./editor-entity-routes.js";
export * from "./editor-game-user-management.js";
export * from "./editor-auth-store.js";
export * from "./editor-graph-routes.js";
export * from "./gamebible-node-routes.js";
export * from "./gamebible-node-save-client.js";
export * from "./gamebible-node-store.js";
export * from "./http-server.js";
export * from "./password-verifier.js";
export * from "./request-security.js";
export * from "./session-cookies.js";

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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startApiServer();
}
