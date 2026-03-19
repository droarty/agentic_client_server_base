import { WebSocket } from 'ws';
import { AnyMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { getChannelSockets } from '../redis/channel.registry';

export class EventProcessor {
  constructor(private localSockets: Map<string, WebSocket>) {}

  async process(channel: string, message: AnyMessage): Promise<void> {
    const socketIds = await getChannelSockets(channel);
    const frame = JSON.stringify({ type: 'channel-message', channel, message } satisfies WsServerMessage);
    for (const socketId of socketIds) {
      const ws = this.localSockets.get(socketId);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(frame);
      }
    }
  }
}
