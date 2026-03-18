import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { ChatMessage, WsClientMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { env } from '../config/env';

interface AuthenticatedSocket extends WebSocket {
  userId?: string;
  isAuthenticated?: boolean;
}

export class UserEventManager {
  private wss: WebSocketServer;
  private clients = new Set<AuthenticatedSocket>();

  constructor(server: Server) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (ws: AuthenticatedSocket) => this.handleConnection(ws));
    console.log('WebSocket server attached');
  }

  private handleConnection(ws: AuthenticatedSocket): void {
    this.clients.add(ws);

    // Close unauthenticated connections after 5s
    const authTimeout = setTimeout(() => {
      if (!ws.isAuthenticated) ws.close(4001, 'Authentication timeout');
    }, 5000);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WsClientMessage;

        if (msg.type === 'auth') {
          this.handleAuth(ws, msg.token, authTimeout);
        } else if (msg.type === 'chat' && ws.isAuthenticated) {
          this.broadcast(msg.channel, msg.message);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.clients.delete(ws);
    });
  }

  private handleAuth(ws: AuthenticatedSocket, token: string, authTimeout: ReturnType<typeof setTimeout>): void {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as { userId: string };
      ws.userId = payload.userId;
      ws.isAuthenticated = true;
      clearTimeout(authTimeout);
      this.send(ws, { type: 'auth_success' });
    } catch {
      this.send(ws, { type: 'auth_error', message: 'Invalid token' });
      ws.close(4001, 'Authentication failed');
    }
  }

  private broadcast(channel: string, message: ChatMessage): void {
    const payload: WsServerMessage = { type: 'chat', channel, message };
    const json = JSON.stringify(payload);
    this.clients.forEach((client) => {
      if (client.isAuthenticated && client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    });
  }

  private send(ws: WebSocket, msg: WsServerMessage): void {
    ws.send(JSON.stringify(msg));
  }
}
