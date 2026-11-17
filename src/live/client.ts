import type { ClientMessage, LiveEvent } from "./protocol.ts";

// Browser side of the live transport: one WebSocket per wish list, shared by
// every subscription on the page. Its shape matches fate's live connector
// (subscribe returns an unsubscribe function, close ends the connection).
// After a reconnect it subscribes again; events missed while offline are not
// replayed, so callers should refetch when onReconnect fires.

type Subscription = { topic: string; onEvent: (event: LiveEvent) => void };

export type LiveClient = {
  subscribe(options: {
    id: string;
    topic: string;
    onEvent: (event: LiveEvent) => void;
  }): Promise<() => void>;
  close(): void;
};

// url is called before every connection attempt, so each one can carry a fresh
// session token.
export function connectLive(
  url: () => Promise<string>,
  options: { retryDelay?: number; onReconnect?: () => void } = {},
): LiveClient {
  const subscriptions = new Map<string, Subscription>();
  let socket: WebSocket | undefined;
  let closed = false;
  let connectedBefore = false;

  const send = (message: ClientMessage) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const open = async () => {
    const next = await url();
    if (closed) return;
    socket = new WebSocket(next);
    socket.addEventListener("open", () => {
      for (const [id, { topic }] of subscriptions) send({ op: "subscribe", id, topic });
      if (connectedBefore) options.onReconnect?.();
      connectedBefore = true;
    });
    socket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as LiveEvent;
      subscriptions.get(event.subscriptionId)?.onEvent(event);
    });
    socket.addEventListener("close", () => {
      if (!closed) setTimeout(() => void open(), options.retryDelay ?? 1000);
    });
  };
  void open();

  return {
    async subscribe({ id, topic, onEvent }) {
      subscriptions.set(id, { topic, onEvent });
      send({ op: "subscribe", id, topic });
      return () => {
        subscriptions.delete(id);
        send({ op: "unsubscribe", id });
      };
    },
    close() {
      closed = true;
      socket?.close();
    },
  };
}
