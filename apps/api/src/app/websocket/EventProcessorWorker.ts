import { parentPort } from 'worker_threads';
import * as path from 'path';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { OutboundMessage, ValidateTextMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';
import { WorkflowEngine, AiStepConfig, WorkflowContext } from './WorkflowEngine';

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

async function executeQuery(queryName: string, context: WorkflowContext): Promise<Record<string, unknown>> {
  try {
    await dbReady;
    const db = mongoClient.db();
    if (queryName === 'get-user-documents') {
      const userId = context.user?.['id'] as string | undefined;
      if (!userId) return { documents: [] };
      const rawDocs = await db
        .collection('chatdocuments')
        .find(
          { userId, type: { $ne: 'user-dashboard' } },
          { projection: { _id: 1, name: 1, type: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } }
        )
        .toArray();
      return { documents: JSON.parse(JSON.stringify(rawDocs)) };
    }
    if (queryName === 'get-document') {
      const documentId = context.message['documentId'] as string | undefined;
      if (!documentId) return { document: null };
      const { ObjectId } = await import('mongodb');
      const rawDoc = await db
        .collection('chatdocuments')
        .findOne({ _id: new ObjectId(documentId) });
      return { document: rawDoc ? JSON.parse(JSON.stringify(rawDoc)) : null };
    }
    if (queryName === 'create-document') {
      const name = (context.message['name'] as string | undefined)?.trim();
      const type = (context.message['documentType'] as string | undefined) ?? 'chat';
      if (!name) return { document: null, documents: [] };
      const userId = context.user?.['id'] as string | undefined;
      const { randomUUID } = await import('crypto');
      const now = new Date();
      const result = await db.collection('chatdocuments').insertOne({
        name,
        type,
        userId,
        currentChannelId: randomUUID(),
        messages: [],
        createdAt: now,
        updatedAt: now,
      });
      const newDoc = await db.collection('chatdocuments').findOne({ _id: result.insertedId });
      const rawDocs = await db
        .collection('chatdocuments')
        .find(
          { userId, type: { $ne: 'user-dashboard' } },
          { projection: { _id: 1, name: 1, type: 1, currentChannelId: 1, createdAt: 1, updatedAt: 1 } }
        )
        .toArray();
      return {
        document: JSON.parse(JSON.stringify(newDoc)),
        documents: JSON.parse(JSON.stringify(rawDocs)),
      };
    }
    return {};
  } catch (err) {
    console.error('executeQuery error:', err);
    return {};
  }
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
    executeQuery,
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
