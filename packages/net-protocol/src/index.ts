export const GK_SOCKET_TYPES = [
  "editor.publish.request",
  "editor.publish.result",
  "runtime.state.patch",
  "runtime.telemetry.event"
] as const;

export type GkSocketType = (typeof GK_SOCKET_TYPES)[number];

export interface ProtocolMessage<TPayload = unknown> {
  readonly type: GkSocketType;
  readonly payload: TPayload;
  readonly requestId?: string;
}

export interface ProtocolEnvelope<TPayload = unknown> {
  readonly sentAt: string;
  readonly message: ProtocolMessage<TPayload>;
}

