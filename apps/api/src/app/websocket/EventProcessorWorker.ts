import { parentPort } from 'worker_threads';
import * as path from 'path';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { OutboundMessage, ValidateTextMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';
import { WorkflowEngine, AiStepConfig } from './WorkflowEngine';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});
redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';
const mongoClient = new MongoClient(mongoUri);
const dbReady = mongoClient.connect();
dbReady.catch((err) => console.error('EventProcessorWorker MongoDB error:', err.message));

const aiEventManager = new AIEventManager();

const configDir = path.join(__dirname, '..', 'config', 'workflows');

async function publishToClient(outbound: OutboundMessage): Promise<void> {
  const socketIds = await redis.smembers(`channel:${outbound.channel}`);
  if (socketIds.length === 0) return;
  const frame = JSON.stringify({ type: 'channel-message', message: outbound } satisfies WsServerMessage);
  await redis.publish(PUBSUB_CHANNEL, JSON.stringify({ frame, socketIds } satisfies DeliveryInstruction));
}

async function persistToDatabase(outbound: OutboundMessage): Promise<void> {
  await dbReady;
  await mongoClient
    .db()
    .collection('chatdocuments')
    .updateOne(
      { currentChannelId: outbound.channel },
      { $push: { messages: outbound } } as any
    );
}

async function getDocumentType(channel: string): Promise<string | null> {
  try {
    await dbReady;
    const doc = await mongoClient
      .db()
      .collection('chatdocuments')
      .findOne({ currentChannelId: channel }, { projection: { type: 1 } });
    return doc?.type ?? null;
  } catch {
    return null;
  }
}

const engine = new WorkflowEngine(
  {
    publishToClient,
    persistToDatabase,
    sendToAi: (channel, text, senderEmail, aiConfig: AiStepConfig) => {
      const msg: ValidateTextMessage = {
        type: 'validate-text',
        from: 'server',
        to: 'ai-service',
        channel,
        timestamp: new Date().toISOString(),
        text,
        senderEmail,
      };
      aiEventManager.publish(msg, aiConfig);
    },
    getDocumentType,
  },
  configDir
);

parentPort!.on('message', async (input: WorkerInput) => {
  const { message, user } = input;
  try {
    await engine.execute({ message, user });
  } catch (err) {
    console.error('WorkflowEngine execution error:', err);
  }
});
