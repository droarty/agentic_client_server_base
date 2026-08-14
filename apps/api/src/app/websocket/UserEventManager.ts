import * as path from 'path';
import * as fs from 'fs';
import { pack, unpack } from 'msgpackr';
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  WsClientMessage,
  WsServerMessage,
  PUBSUB_CHANNEL,
  DeliveryInstruction,
} from '@agentic-client-server-base/shared-types';
import { WORKFLOW_CONFIG_DIR } from '@agentic-client-server-base/workflow-configs';
import { env } from '../config/env';
import { redisSub } from '../redis/redis.client';
import { registerSocket, unregisterSocket } from '../redis/socket.registry';
import { addSocketToChannel, removeSocketFromChannel } from '../redis/channel.registry';
import { submitEvent } from '../services/processor.client';
import { ensureDashboardChannel } from '../services/dashboard.service';

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

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: AuthenticatedSocket) => this.handleConnection(ws));

    redisSub.subscribe(PUBSUB_CHANNEL).catch((err) =>
      console.error('Redis subscribe error:', err)
    );

    redisSub.on('messageBuffer', (_ch: Buffer, data: Buffer) => {
      const { frame, socketIds } = unpack(data) as DeliveryInstruction;
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
        const msg = unpack(data as Buffer) as WsClientMessage;

        if (msg.type === 'auth') {
          void this.handleAuth(ws, msg.token, authTimeout);
        } else if (ws.isAuthenticated) {
          if (msg.type === 'subscribe') {
            void addSocketToChannel(socketId, msg.channel);
          } else if (msg.type === 'unsubscribe') {
            void removeSocketFromChannel(socketId, msg.channel);
          } else if (msg.type === 'channel-message') {
            void addSocketToChannel(socketId, msg.message.channel);
            submitEvent(
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
    } catch {
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
      ws.close(4001, 'Authentication failed');
    }
  }

  private async ensureDashboardDocument(userId: string): Promise<string> {
    const configPath = path.join(WORKFLOW_CONFIG_DIR, 'user-dashboard.json');
    let initialState: Record<string, unknown> | undefined;
    if (fs.existsSync(configPath)) {
      const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
        initialState?: Record<string, unknown>;
      };
      initialState = wfConfig.initialState;
    }

    return ensureDashboardChannel({
      workflowType: 'user-dashboard',
      userId,
      artifactName: 'Dashboard',
      initialState,
    });
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    ws.send(pack(msg));
  }
}
