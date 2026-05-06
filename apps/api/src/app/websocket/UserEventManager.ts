import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import { WsClientMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { env } from '../config/env';
import { redisSub } from '../redis/redis.client';
import { registerSocket, unregisterSocket } from '../redis/socket.registry';
import { addSocketToChannel, removeSocketFromChannel } from '../redis/channel.registry';
import { EventProcessor } from './EventProcessor';
import { PUBSUB_CHANNEL, DeliveryInstruction } from './EventProcessorTypes';
import { ArtifactModel } from '../models/document.model';

const serverId = randomUUID();

interface AuthenticatedSocket extends WebSocket {
  socketId?: string;
  userId?: string;
  userEmail?: string;
  isAuthenticated?: boolean;
}

export class UserEventManager {
  private wss: WebSocketServer;
  private localSockets = new Map<string, AuthenticatedSocket>();
  private eventProcessor = new EventProcessor();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: AuthenticatedSocket) => this.handleConnection(ws));

    redisSub.subscribe(PUBSUB_CHANNEL).catch((err) =>
      console.error('Redis subscribe error:', err)
    );

    redisSub.on('message', (_ch, data) => {
      const { frame, socketIds }: DeliveryInstruction = JSON.parse(data);
      for (const socketId of socketIds) {
        const ws = this.localSockets.get(socketId);
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(frame);
        }
      }
    });

    console.log(`WebSocket server attached (serverId: ${serverId})`);
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
          } else if (msg.type === 'unsubscribe') {
            void removeSocketFromChannel(socketId, msg.channel);
          } else if (msg.type === 'channel-message') {
            void addSocketToChannel(socketId, msg.message.channel);
            this.eventProcessor.process(
              { ...msg.message, senderEmail: ws.userEmail! },
              { id: ws.userId!, email: ws.userEmail! }
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
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string; email: string };
      ws.userId = payload.userId;
      ws.userEmail = payload.email;
      ws.isAuthenticated = true;
      clearTimeout(authTimeout);
      this.localSockets.set(ws.socketId!, ws);
      await registerSocket(ws.socketId!, payload.userId, serverId);

      const dashboardChannelId = await this.ensureDashboardDocument(payload.userId);
      await addSocketToChannel(ws.socketId!, dashboardChannelId);

      this.send(ws, { type: 'auth_success', dashboardChannelId });

      this.eventProcessor.fire(
        {
          type: 'initialize',
          channel: dashboardChannelId,
          timestamp: new Date().toISOString(),
          from: 'server',
          to: 'server',
        },
        { id: payload.userId, email: payload.email }
      );
    } catch {
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
      ws.close(4001, 'Authentication failed');
    }
  }

  private async ensureDashboardDocument(userId: string): Promise<string> {
    let doc = await ArtifactModel.findOne({ type: 'user-dashboard', userId });
    if (!doc) {
      doc = await ArtifactModel.create({
        name: 'Dashboard',
        type: 'user-dashboard',
        userId,
      });
    }
    return doc.currentChannelId;
  }

  shutdown(): void {
    this.eventProcessor.shutdown();
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    ws.send(JSON.stringify(msg));
  }
}
