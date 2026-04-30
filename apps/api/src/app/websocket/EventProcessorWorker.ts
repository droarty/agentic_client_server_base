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

async function persistToDatabase(outbound: OutboundMessage): Promise<void> {
  await dbReady;
  const db = mongoClient.db();
  const rec = outbound as unknown as Record<string, unknown>;

  // Always append to messages (replay log)
  await db.collection('chatdocuments').updateOne(
    { currentChannelId: outbound.channel },
    { $push: { messages: outbound } } as any
  );

  if (rec['type'] !== 'update-state') return;

  const setOps: Record<string, unknown> = {};
  const pushOps: Record<string, unknown> = {};
  const pullOps: Record<string, unknown> = {};

  // update → $set
  const updateAct = rec['update'] as Record<string, unknown> | undefined;
  if (updateAct) {
    for (const [path, value] of Object.entries(updateAct)) {
      setOps[path] = value;
    }
  }

  // merge → $set via dot-path expansion on each sub-key
  const mergeAct = rec['merge'] as Record<string, unknown> | undefined;
  if (mergeAct) {
    for (const [path, value] of Object.entries(mergeAct)) {
      if (typeof value === 'object' && value !== null) {
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          setOps[`${path}.${k}`] = v;
        }
      } else {
        setOps[path] = value;
      }
    }
  }

  // append → $push $each
  const appendAct = rec['append'] as Record<string, unknown> | undefined;
  if (appendAct) {
    for (const [path, value] of Object.entries(appendAct)) {
      const items = Array.isArray(value) ? value : [value];
      pushOps[path] = { $each: items };
    }
  }

  // prepend → $push {$each, $position: 0}
  const prependAct = rec['prepend'] as Record<string, unknown> | undefined;
  if (prependAct) {
    for (const [path, value] of Object.entries(prependAct)) {
      const items = Array.isArray(value) ? value : [value];
      pushOps[path] = { $each: items, $position: 0 };
    }
  }

  // remove → $pull by key field
  const removeAct = rec['remove'] as Record<string, unknown> | undefined;
  const keyField = rec['key'] as string | undefined;
  if (removeAct && keyField) {
    for (const [path, matcher] of Object.entries(removeAct)) {
      pullOps[path] = { [keyField]: (matcher as Record<string, unknown>)[keyField] };
    }
  }

  const mongoUpdate: Record<string, unknown> = {};
  if (Object.keys(setOps).length) mongoUpdate['$set'] = setOps;
  if (Object.keys(pushOps).length) mongoUpdate['$push'] = pushOps;
  if (Object.keys(pullOps).length) mongoUpdate['$pull'] = pullOps;

  if (Object.keys(mongoUpdate).length) {
    await db.collection('chatdocuments').updateOne(
      { currentChannelId: outbound.channel }, mongoUpdate as any
    );
  }
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
      let initialState: Record<string, unknown> | undefined;
      if (fs.existsSync(configPath)) {
        const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
        initialState = wfConfig.initialState;
      }
      const docFields: Record<string, unknown> = {
        name,
        type,
        userId,
        currentChannelId: randomUUID(),
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      if (initialState !== undefined) {
        docFields['state'] = initialState;
        docFields['users'] = [];
      }
      const result = await db.collection('chatdocuments').insertOne(docFields as any);
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
