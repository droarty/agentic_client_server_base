import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { OutboundMessage, ValidateTextMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';
import { WorkflowEngine, AiStepConfig, WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});
redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/multiplayer_base';
const mongoClient = new MongoClient(mongoUri);
const dbReady = mongoClient.connect();
dbReady.catch((err) => console.error('EventProcessorWorker MongoDB error:', err.message));

dbReady.then(() =>
  mongoClient.db().collection('workflowlogs')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 })
).catch(console.error);

const aiEventManager = new AIEventManager();

const configDir = path.join(__dirname, '..', 'config', 'workflows');

function logWorkflowStep(entry: WorkflowLogEntry): void {
  mongoClient.db().collection('workflowlogs')
    .insertOne(entry)
    .catch((err) => console.error('logWorkflowStep error:', err));
}

async function publishToClient(outbound: OutboundMessage): Promise<void> {
  const socketIds = await redis.smembers(`channel:${outbound.channel}`);
  if (socketIds.length === 0) return;
  const frame = JSON.stringify({ type: 'channel-message', message: outbound } satisfies WsServerMessage);
  await redis.publish(PUBSUB_CHANNEL, JSON.stringify({ frame, socketIds } satisfies DeliveryInstruction));
}

async function appendToReplayLog(outbound: OutboundMessage): Promise<void> {
  await dbReady;
  await mongoClient.db().collection('chatdocuments').updateOne(
    { currentChannelId: outbound.channel },
    { $push: { messages: outbound } } as any
  );
}

async function persistToDatabase(outbound: OutboundMessage): Promise<void> {
  await dbReady;
  const db = mongoClient.db();
  const rec = outbound as unknown as Record<string, unknown>;

  if (rec['type'] !== 'update-state') return;

  const actions = rec['actions'] as Array<Record<string, unknown>> | undefined;
  if (!actions?.length) return;

  const setOps: Record<string, unknown> = {};
  const pushOps: Record<string, unknown> = {};
  const pullOps: Record<string, unknown> = {};

  for (const action of actions) {
    const actionType = action['actionType'] as string;
    const path = action['path'] as string;
    const value = action['value'];
    const keys = action['keys'] as string[] | undefined;

    switch (actionType) {
      case 'update':
        setOps[path] = value;
        break;
      case 'merge':
        if (typeof value === 'object' && value !== null) {
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            setOps[`${path}.${k}`] = v;
          }
        } else {
          setOps[path] = value;
        }
        break;
      case 'append': {
        const items = Array.isArray(value) ? value : [value];
        pushOps[path] = { $each: items };
        break;
      }
      case 'prepend': {
        const items = Array.isArray(value) ? value : [value];
        pushOps[path] = { $each: items, $position: 0 };
        break;
      }
      case 'upsert': {
        if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: upsert action missing keys array', errorDetail: action }); break; }
        const item = value as Record<string, unknown>;
        const fieldRef = `$${path}`;
        const matchCond = keys.length === 1
          ? { $eq: [`$$el.${keys[0]}`, item[keys[0]]] }
          : { $and: keys.map((k) => ({ $eq: [`$$el.${k}`, item[k]] })) };
        const inCond = keys.length === 1
          ? { $in: [item[keys[0]], { $map: { input: { $ifNull: [fieldRef, []] }, as: 'el', in: `$$el.${keys[0]}` } }] }
          : { $gt: [{ $size: { $filter: { input: { $ifNull: [fieldRef, []] }, as: 'el', cond: matchCond } } }, 0] };
        await db.collection('chatdocuments').updateOne(
          { currentChannelId: outbound.channel },
          [{
            $set: {
              [path]: {
                $cond: {
                  if: inCond,
                  then: { $map: { input: fieldRef, as: 'el', in: { $cond: { if: matchCond, then: item, else: '$$el' } } } },
                  else: { $concatArrays: [{ $ifNull: [fieldRef, []] }, [item]] },
                },
              },
            },
          }] as any
        );
        break;
      }
      case 'remove': {
        if (!keys?.length) { logWorkflowStep({ createdAt: new Date(), channel: outbound.channel, docType: '', handlerName: '', logType: 'error', errorMessage: 'persistToDatabase: remove action missing keys array', errorDetail: action }); break; }
        const matcher = value as Record<string, unknown>;
        const pullMatcher: Record<string, unknown> = {};
        for (const k of keys) pullMatcher[k] = matcher[k];
        pullOps[path] = pullMatcher;
        break;
      }
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
    if (queryName === 'get-workflow-logs') {
      const documentId = context.message['documentId'] as string | undefined;
      if (!documentId) return { documentId: null, workflowLogs: [] };
      const { ObjectId } = await import('mongodb');
      const doc = await db.collection('chatdocuments').findOne(
        { _id: new ObjectId(documentId) },
        { projection: { currentChannelId: 1 } }
      );
      if (!doc) return { documentId, workflowLogs: [] };
      const logs = await db.collection('workflowlogs')
        .find({ channel: doc.currentChannelId, parentExecutionId: { $exists: false }, logType: 'handler' })
        .sort({ createdAt: -1 })
        .toArray();
      return { documentId, workflowLogs: JSON.parse(JSON.stringify(logs)) };
    }

    return {};
  } catch (err) {
    logWorkflowStep({ createdAt: new Date(), channel: (context.message['channel'] as string) || '', docType: '', handlerName: queryName, logType: 'error', errorMessage: 'executeQuery error', errorDetail: String(err) });
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
    appendToReplayLog,
    logWorkflowStep,
    sendToAi: (channel, text, senderEmail, aiConfig: AiStepConfig, user, correlationId) => {
      const msg: ValidateTextMessage = {
        type: 'validate-text',
        from: 'server',
        to: 'ai-service',
        channel,
        timestamp: new Date().toISOString(),
        text,
        senderEmail,
        correlationId,
      };
      aiEventManager.publish(msg, aiConfig, user as { id: string; email: string } | undefined);
    },
    getDocumentType,
    executeQuery,
  },
  configDir
);

parentPort!.on('message', async (input: WorkerInput) => {
  const { message, user } = input;
  const correlationId = message['correlationId'] as string | undefined;
  let parentExecutionId: string | undefined;
  let parentStepIndex: number | undefined;
  if (correlationId) {
    const [eid, sidx] = correlationId.split(':');
    parentExecutionId = eid;
    parentStepIndex = sidx !== undefined ? parseInt(sidx, 10) : undefined;
  }
  try {
    await engine.execute({ message, user }, parentExecutionId, parentStepIndex);
  } catch (err) {
    logWorkflowStep({ createdAt: new Date(), channel: (message['channel'] as string) || '', docType: '', handlerName: (message['type'] as string) || '', logType: 'error', errorMessage: 'WorkflowEngine execution error', errorDetail: String(err) });
  }
});
