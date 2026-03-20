import { InboundMessage, OutboundMessage, WsClientMessage, WsServerMessage } from '@multiplayer-base/shared-types';

type MessageCallback = (message: OutboundMessage) => void;

const WS_URL = 'ws://localhost:3000';
const MAX_RECONNECT_DELAY = 30000;

class EventManager {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<MessageCallback>>();
  private subscribedChannels = new Set<string>();
  private isAuthenticated = false;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    this.shouldReconnect = true;
    this.ws = new WebSocket(WS_URL);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.isAuthenticated = false;
      this.send({ type: 'auth', token });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage;
        if (msg.type === 'auth_success') {
          this.isAuthenticated = true;
          this.subscribedChannels.forEach((channel) => {
            this.send({ type: 'subscribe', channel });
          });
        } else if (msg.type === 'channel-message') {
          this.notify(msg.message.channel, msg.message);
        }
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.isAuthenticated = false;
      if (this.shouldReconnect) this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.isAuthenticated = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  subscribe(channel: string, callback: MessageCallback): () => void {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    this.subscribers.get(channel)!.add(callback);
    this.subscribedChannels.add(channel);
    this.connect();

    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.send({ type: 'subscribe', channel });
    }

    return () => {
      const subs = this.subscribers.get(channel);
      if (!subs) return;
      subs.delete(callback);
      if (subs.size === 0) {
        this.subscribers.delete(channel);
        this.subscribedChannels.delete(channel);
        if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
          this.send({ type: 'unsubscribe', channel });
        }
      }
    };
  }

  publish(channel: string, message: InboundMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated) {
      this.send({ type: 'channel-message', message });
    }
  }

  private send(msg: WsClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }

  private notify(channel: string, message: OutboundMessage): void {
    this.subscribers.get(channel)?.forEach((cb) => cb(message));
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
      this.connect();
    }, this.reconnectDelay);
  }
}

export const eventManager = new EventManager();
