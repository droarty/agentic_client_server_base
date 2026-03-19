import { parentPort } from 'worker_threads';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
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

const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';
const mongoClient = new MongoClient(mongoUri);
const dbReady = mongoClient.connect();
dbReady.catch((err) => console.error('EventProcessorWorker MongoDB error:', err.message));

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

  const [socketIds] = await Promise.all([
    redis.smembers(`channel:${outbound.channel}`),
    dbReady.then(() =>
      mongoClient
        .db()
        .collection('chatdocuments')
        .updateOne(
          { currentChannelId: outbound.channel },
          { $push: { messages: outbound } }
        )
    ),
  ]);

  if (socketIds.length === 0) return;

  const frame = JSON.stringify(
    { type: 'channel-message', message: outbound } satisfies WsServerMessage
  );

  await redis.publish(
    PUBSUB_CHANNEL,
    JSON.stringify({ frame, socketIds } satisfies DeliveryInstruction)
  );
});
