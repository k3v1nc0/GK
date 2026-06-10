import { GK_SOCKET_TYPES, type GkSocketType } from "@gk/net-protocol";

export interface RealtimeGatewayContract {
  readonly supportedSocketTypes: readonly GkSocketType[];
  readonly contentSource: "published-runtime-state";
}

export function createRealtimeGatewayContract(): RealtimeGatewayContract {
  return {
    supportedSocketTypes: GK_SOCKET_TYPES,
    contentSource: "published-runtime-state"
  };
}

