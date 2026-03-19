import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { AnyMessage, WsClientMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { env } from '../config/env';
import { redis, redisSub } from '../redis/redis.client';
import { registerSocket, unregisterSocket } from '../redis/socket.registry';
import { addSocketToChannel, getChannelSockets } from '../redis/channel.registry';

const PUBSUB_CHANNEL = 'multiplayer:chat';
const serverId = randomUUID();

interface AuthenticatedSocket extends WebSocket {
  socketId?: string;
  userId?: string;
  isAuthenticated?: boolean;
}

interface PubSubPayload {
  channel: string;
  message: AnyMessage;
}

export class UserEventManager {
  private wss: WebSocketServer;
  // In-memory map of socketId → ws for sockets connected to THIS server instance
  private localSockets = new Map<string, AuthenticatedSocket>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: AuthenticatedSocket) => this.handleConnection(ws));

    // Subscribe to Redis pub/sub so this server delivers messages published by any server
    redisSub.subscribe(PUBSUB_CHANNEL).catch((err) =>
      console.error('Redis subscribe error:', err)
    );

    redisSub.on('message', (_ch, data) => {
      const payload: PubSubPayload = JSON.parse(data);
      void this.deliverToLocalSockets(payload.channel, payload.message);
    });

    console.log(`WebSocket server attached (serverId: ${serverId})`);
  }

  private async deliverToLocalSockets(channel: string, message: AnyMessage): Promise<void> {
    const socketIds = await getChannelSockets(channel);
    const frame = JSON.stringify({ type: 'channel-message', channel, message } satisfies WsServerMessage);
    for (const socketId of socketIds) {
      const ws = this.localSockets.get(socketId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(frame);
      }
    }
  }

  private handleConnection(ws: AuthenticatedSocket): void {
    const socketId = randomUUID();
    ws.socketId = socketId;

    const authTimeout = setTimeout(() => {
      if (!ws.isAuthenticated) ws.close(4001, 'Authentication timeout');
    }, 5000);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;

        if (msg.type === 'auth') {
          void this.handleAuth(ws, msg.token, authTimeout);
        } else if (ws.isAuthenticated) {
          if (msg.type === 'subscribe') {
            void addSocketToChannel(socketId, msg.channel);
          } else if (msg.type === 'channel-message') {
            // Sending to a channel implicitly subscribes the socket to it
            void addSocketToChannel(socketId, msg.channel);
            void redis.publish(
              PUBSUB_CHANNEL,
              JSON.stringify({ channel: msg.channel, message: msg.message } satisfies PubSubPayload)
            );
          }
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.localSockets.delete(socketId);
      void unregisterSocket(socketId);
    });
  }

  private async handleAuth(
    ws: AuthenticatedSocket,
    token: string,
    authTimeout: ReturnType<typeof setTimeout>
  ): Promise<void> {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      ws.userId = payload.userId;
      ws.isAuthenticated = true;
      clearTimeout(authTimeout);
      this.localSockets.set(ws.socketId!, ws);
      await registerSocket(ws.socketId!, payload.userId, serverId);
      this.send(ws, { type: 'auth_success' });
    } catch {
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
      ws.close(4001, 'Authentication failed');
    }
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    ws.send(JSON.stringify(msg));
  }
}
