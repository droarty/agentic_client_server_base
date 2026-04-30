import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
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

function hasId(item: unknown): boolean {
  return typeof item === 'object' && item !== null && ('id' in item || '_id' in item);
}

async function persistToDatabase(outbound: OutboundMessage): Promise<void> {
  await dbReady;
  const db = mongoClient.db();
  if ((outbound as unknown as Record<string, unknown>)['type'] === 'update-state') {
    const state = (outbound as unknown as Record<string, unknown>)['state'] as Record<string, unknown>;
    const setOps: Record<string, unknown> = {};
    const pushOps: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state)) {
      if (Array.isArray(value) && value.length > 0 && hasId(value[0])) {
        setOps[key] = value;
      } else if (Array.isArray(value)) {
        pushOps[key] = { $each: value };
      } else {
        setOps[key] = value;
      }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(setOps).length) update['$set'] = setOps;
    if (Object.keys(pushOps).length) update['$push'] = pushOps;
    if (Object.keys(update).length) {
      await db.collection('chatdocuments').updateOne({ currentChannelId: outbound.channel }, update as any);
    }
    return;
  }
  await db.collection('chatdocuments').updateOne(
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
      const channel = context.message['channel'] as string | undefined;
      const { ObjectId } = await import('mongodb');
      let rawDoc;
      if (documentId) {
        rawDoc = await db.collection('chatdocuments').findOne({ _id: new ObjectId(documentId) });
      } else if (channel) {
        rawDoc = await db.collection('chatdocuments').findOne({ currentChannelId: channel });
      }
      return { document: rawDoc ? JSON.parse(JSON.stringify(rawDoc)) : null };
    }
    if (queryName === 'get-users') {
      const users = await db
        .collection('users')
        .find({}, { projection: { _id: 1, email: 1, roles: 1 } })
        .toArray();
      return { users: JSON.parse(JSON.stringify(users)) };
    }
    if (queryName === 'create-document') {
      const name = (context.message['name'] as string | undefined)?.trim();
      const type = (context.message['documentType'] as string | undefined) ?? 'chat';
      if (!name) return { document: null, documents: [] };
      const userId = context.user?.['id'] as string | undefined;
      const { randomUUID } = await import('crypto');
      const now = new Date();
      const configPath = path.join(configDir, `${type}.json`);
      let seededState: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
        seededState = wfConfig.initialState ?? {};
      }
      const result = await db.collection('chatdocuments').insertOne({
        name,
        type,
        userId,
        currentChannelId: randomUUID(),
        messages: [],
        ...seededState,
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
