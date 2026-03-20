import { parentPort } from 'worker_threads';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import {
  OutboundMessage,
  DisplayTextMessage,
  DisplayColorfulTextMessage,
  AiRequestMessage,
  WsServerMessage,
} from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';
const mongoClient = new MongoClient(mongoUri);
const dbReady = mongoClient.connect();
dbReady.catch((err) => console.error('EventProcessorWorker MongoDB error:', err.message));

const aiEventManager = new AIEventManager();

async function toOutbound(input: WorkerInput): Promise<OutboundMessage> {
  const { message } = input;
  const base = {
    id: randomUUID(),
    from: 'server' as const,
    to: 'client' as const,
    channel: message.channel,
    timestamp: new Date().toISOString(),
    authorEmail: message.senderEmail,
  };

  if (message.type === 'add-text') {
    const aiRequest: AiRequestMessage = {
      type: 'ai-request',
      from: 'server',
      to: 'ai-service',
      channel: message.channel,
      timestamp: new Date().toISOString(),
      prompt: `Please review the following text for inappropriate content and respond with a JSON message of type "valid-text" if acceptable or "inappropriate-text" if not: "${message.text}"`,
      originalText: message.text,
    };

    const aiResponse = await aiEventManager.process(aiRequest);

    if (aiResponse.type === 'valid-text') {
      return { ...base, type: 'display-text', text: message.text } satisfies DisplayTextMessage;
    } else {
      return {
        ...base,
        type: 'display-colorful-text',
        text: 'inappropriate text',
        color: 'red',
      } satisfies DisplayColorfulTextMessage;
    }
  }

  // add-colorful-text
  return {
    ...base,
    type: 'display-colorful-text',
    text: message.text,
    color: message.color,
  } satisfies DisplayColorfulTextMessage;
}

parentPort!.on('message', async (input: WorkerInput) => {
  const outbound = await toOutbound(input);

  const [socketIds] = await Promise.all([
    redis.smembers(`channel:${outbound.channel}`),
    dbReady.then(() =>
      mongoClient
        .db()
        .collection('chatdocuments')
        .updateOne(
          { currentChannelId: outbound.channel },
          { $push: { messages: outbound } } as any
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
