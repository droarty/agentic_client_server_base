import { parentPort } from 'worker_threads';
import * as path from 'path';
import * as fs from 'fs';
import { pack } from 'msgpackr';
import Redis from 'ioredis';
import { MongoClient } from 'mongodb';
import { OutboundMessage, ValidateTextMessage, WsServerMessage } from '@agentic-client-server-base/shared-types';
import { PUBSUB_CHANNEL, WorkerInput, DeliveryInstruction } from './EventProcessorTypes';
import { AIEventManager } from './AIEventManager';
import { WorkflowEngine, AiStepConfig, WorkflowLogEntry } from './WorkflowEngine';
import { createQueryExecutor } from './QueryExecutor';
import { createDatabasePersistor } from './DatabasePersistor';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});
redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

const mongoUri = process.env['MONGODB_URI'] || 'mongodb://localhost:27017/agentic_client_server_base';
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

async function fetchCustomWorkflowConfig(docType: string) {
  try {
    await dbReady;
    const row = await mongoClient.db().collection('workflowconfigs').findOne({ name: docType });
    if (!row) return null;
    return { name: row['name'] as string, version: row['version'] as string, handlers: row['handlers'] as Record<string, never> };
  } catch {
    return null;
  }
}

const executeQuery = createQueryExecutor({ mongoClient, dbReady, configDir, logWorkflowStep });
const persistToDatabase = createDatabasePersistor({ mongoClient, dbReady, logWorkflowStep });

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
    getDocumentType,
    executeQuery,
    fetchCustomWorkflowConfig,
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
