import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { pack } from 'msgpackr';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { OutboundMessage, ValidateTextMessage, WsServerMessage } from '@multiplayer-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';
import { WorkflowEngine, AiStepConfig, WorkflowLogEntry } from './WorkflowEngine';
import { createQueryExecutor } from './QueryExecutor';
import { createDatabasePersistor } from './DatabasePersistor';
import { fileExtractService, ChatMessage } from '../services/fileExtract.service';

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
  const frame = pack({ type: 'channel-message', message: outbound } satisfies WsServerMessage);
  await redis.publish(PUBSUB_CHANNEL, pack({ frame, socketIds } satisfies DeliveryInstruction));
}

async function getDocumentType(channel: string): Promise<string | null> {
  try {
    await dbReady;
    const doc = await mongoClient
      .db()
      .collection('artifacts')
      .findOne({ currentChannelId: channel }, { projection: { type: 1 } });
    return doc?.type ?? null;
  } catch {
    return null;
  }
}

const executeQuery = createQueryExecutor({ mongoClient, dbReady, configDir, logWorkflowStep });
const persistToDatabase = createDatabasePersistor({ mongoClient, dbReady, logWorkflowStep });

async function handleFileAiStep(
  channel: string,
  aiConfig: AiStepConfig,
  messageContext: Record<string, unknown>,
  user: Record<string, unknown> | undefined,
  correlationId: string | undefined
): Promise<void> {
  try {
    await dbReady;
    const db = mongoClient.db();
    const doc = await db.collection('artifacts').findOne({ currentChannelId: channel });
    const state = (doc?.state ?? {}) as Record<string, unknown>;

    const fileId = state['fileId'] as string | undefined;
    if (!fileId) throw new Error('file-ai step: no fileId in document state');

    let raw: string;
    if (aiConfig.type === 'file-extract') {
      const schema = state['proposedSchema'] as Record<string, unknown> | undefined;
      if (!schema) throw new Error('file-extract step: no proposedSchema in document state');
      raw = await fileExtractService.extractFromFile({
        fileId,
        schema,
        systemPrompt: aiConfig.systemPrompt,
        model: aiConfig.model,
        maxTokens: aiConfig.maxTokens,
      });
    } else {
      // file-chat
      const chatHistory = (state['chatHistory'] ?? []) as ChatMessage[];
      const userMessage = (messageContext['text'] as string | undefined) ?? '';
      raw = await fileExtractService.fileChat({
        fileId,
        chatHistory,
        userMessage,
        systemPrompt: aiConfig.systemPrompt,
        model: aiConfig.model,
        maxTokens: aiConfig.maxTokens,
      });
    }

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`file-ai step: invalid JSON response: ${raw.slice(0, 200)}`);
    }

    const responseType = parsed['type'] as string | undefined;
    if (!responseType) throw new Error(`file-ai step: response missing type field: ${raw.slice(0, 200)}`);

    await engine.execute({
      message: {
        type: responseType,
        channel,
        timestamp: new Date().toISOString(),
        senderEmail: messageContext['senderEmail'],
        correlationId,
        ...parsed,
      },
      user,
      state,
    });
  } catch (err) {
    logWorkflowStep({ createdAt: new Date(), channel, docType: '', handlerName: 'file-ai-step', logType: 'error', errorMessage: 'handleFileAiStep error', errorDetail: String(err) });
  }
}

const engine = new WorkflowEngine(
  {
    publishToClient,
    persistToDatabase,
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
    sendToAiWithFile: (channel, aiConfig, messageContext, user, correlationId) => {
      handleFileAiStep(channel, aiConfig, messageContext, user, correlationId).catch((err) =>
        console.error('sendToAiWithFile error:', err)
      );
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
