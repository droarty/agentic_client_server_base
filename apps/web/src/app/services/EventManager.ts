import { encode, decode } from '@msgpack/msgpack';
import { InboundMessage, OutboundMessage, WsClientMessage, WsServerMessage } from '@multiplayer-base/shared-types';

type MessageCallback = (message: OutboundMessage) => void;

const WS_URL = 'ws://localhost:3000';
const MAX_RECONNECT_DELAY = 30000;

class EventManager {
  private ws: WebSocket | null = null;
  private debugMode = process.env['NODE_ENV'] === 'development';
  private subscribers = new Map<string, Set<MessageCallback>>();
  private subscribedChannels = new Set<string>();
  private isAuthenticated = false;
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private dashboardChannelId: string | null = null;
  private dashboardReadyCallbacks: Array<(channelId: string) => void> = [];

  connect(): void {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    this.shouldReconnect = true;
    this.ws = new WebSocket(WS_URL);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.isAuthenticated = false;
      this.send({ type: 'auth', token });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = decode(event.data) as WsServerMessage;
        if (this.debugMode) console.log('[WS ←]', JSON.stringify(msg, null, 2));
        if (msg.type === 'auth_success') {
          this.isAuthenticated = true;
          if (msg.dashboardChannelId) {
            this.dashboardChannelId = msg.dashboardChannelId;
            this.subscribedChannels.add(msg.dashboardChannelId);
            const cbs = this.dashboardReadyCallbacks;
            this.dashboardReadyCallbacks = [];
            cbs.forEach((cb) => cb(msg.dashboardChannelId!));
          }
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
    this.dashboardChannelId = null;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  getDashboardChannelId(): string | null {
    return this.dashboardChannelId;
  }

  onDashboardReady(cb: (channelId: string) => void): () => void {
    if (this.dashboardChannelId) {
      cb(this.dashboardChannelId);
      return () => {};
    }
    this.dashboardReadyCallbacks.push(cb);
    return () => {
      this.dashboardReadyCallbacks = this.dashboardReadyCallbacks.filter((c) => c !== cb);
    };
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

  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  private send(msg: WsClientMessage): void {
    if (this.debugMode) console.log('[WS →]', JSON.stringify(msg, null, 2));
    this.ws?.send(encode(msg));
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
