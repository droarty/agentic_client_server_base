import { parentPort } from 'worker_threads';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import {
  OutboundMessage,
  DisplayTextMessage,
  DisplayColorfulTextMessage,
  WsServerMessage,
} from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

function toOutbound(input: WorkerInput): OutboundMessage {
  const { message } = input;
  const base = {
    id: randomUUID(),
    from: 'server' as const,
    to: 'client' as const,
    channel: message.channel,
    timestamp: new Date().toISOString(),
    authorEmail: message.senderEmail,
    text: message.text,
  };

  if (message.type === 'add-colorful-text') {
    return { ...base, type: 'display-colorful-text', color: message.color } satisfies DisplayColorfulTextMessage;
  }
  return { ...base, type: 'display-text' } satisfies DisplayTextMessage;
}

parentPort!.on('message', async (input: WorkerInput) => {
  const outbound = toOutbound(input);
  const socketIds = await redis.smembers(`channel:${outbound.channel}`);

  if (socketIds.length === 0) return;

  const frame = JSON.stringify(
    { type: 'channel-message', message: outbound } satisfies WsServerMessage
  );

  await redis.publish(
    PUBSUB_CHANNEL,
    JSON.stringify({ frame, socketIds } satisfies DeliveryInstruction)
  );
});
