import 'dotenv/config';
import { pack } from 'msgpackr';
import Redis from 'ioredis';
import { MongoClient, ObjectId } from 'mongodb';
import {
  OutboundMessage,
  ValidateTextMessage,
  WsServerMessage,
  PUBSUB_CHANNEL,
  DeliveryInstruction,
  EventProcessorRequest,
} from '@agentic-client-server-base/shared-types';
import { AccessLevel, ACCESS_RANK, createAccessLevelCache } from '@agentic-client-server-base/access-control';
import { WORKFLOW_CONFIG_DIR } from '@agentic-client-server-base/workflow-configs';
import { env } from './app/config/env';
import { createApp } from './app/app';
import { AIEventManager } from './app/AIEventManager';
import { WorkflowEngine, AiStepConfig, WorkflowLogEntry, ChannelContext } from './app/WorkflowEngine';
import { createQueryExecutor } from './app/QueryExecutor';
import { createDatabasePersistor } from './app/DatabasePersistor';

const accessLevelCache = createAccessLevelCache(10 * 60 * 1000);

const redis = new Redis(env.REDIS_URL, { enableReadyCheck: false });
redis.on('error', (err) => console.error('event-processor Redis error:', err.message));

const mongoClient = new MongoClient(env.MONGODB_URI);
const dbReady = mongoClient.connect();
dbReady.catch((err) => console.error('event-processor MongoDB error:', err.message));

dbReady.then(() =>
  mongoClient.db().collection('workflowlogs')
    .createIndex({ createdAt: 1 }, { expireAfterSeconds: 604800 })
).catch(console.error);

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

async function getChannelContext(channel: string): Promise<ChannelContext | null> {
  try {
    await dbReady;
    const doc = await mongoClient
      .db()
      .collection('channels')
      .findOne({ channelId: channel });
    if (!doc) return null;
    return {
      workflowType: doc['workflowType'] as string,
      artifactId: doc['artifactId'] ? String(doc['artifactId']) : undefined,
      groupId: doc['groupId'] ? String(doc['groupId']) : undefined,
      userId: doc['userId'] as string | undefined,
      parentChannelId: doc['parentChannelId'] as string | undefined,
      responseHandler: doc['responseHandler'] as string | undefined,
      targetChannelId: doc['targetChannelId'] as string | undefined,
    };
  } catch {
    return null;
  }
}

async function getArtifactState(artifactId: string): Promise<Record<string, unknown> | null> {
  try {
    await dbReady;
    const doc = await mongoClient.db().collection('artifacts')
      .findOne({ _id: new ObjectId(artifactId) }, { projection: { state: 1 } });
    return (doc?.['state'] as Record<string, unknown> | undefined) ?? null;
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

async function getEffectiveGroupIds(userId: string): Promise<ObjectId[]> {
  await dbReady;
  const db = mongoClient.db();
  const memberships = await db.collection('memberships')
    .find({ userId: new ObjectId(userId) }, { projection: { groupId: 1 } })
    .toArray();
  if (memberships.length === 0) return [];
  const directIds = memberships.map((m) => m['groupId'] as ObjectId);
  const groups = await db.collection('groups')
    .find({ _id: { $in: directIds } }, { projection: { ancestors: 1 } })
    .toArray();
  const allIds = new Set<string>(directIds.map((id) => id.toString()));
  for (const g of groups) {
    for (const anc of (g['ancestors'] as ObjectId[] | undefined) ?? []) {
      allIds.add(anc.toString());
    }
  }
  return [...allIds].map((id) => new ObjectId(id));
}

async function computeGroupAccessLevel(
  userId: string,
  permissions: Array<{ groupId: ObjectId; access: string }>
): Promise<AccessLevel> {
  const effectiveIds = await getEffectiveGroupIds(userId);
  if (effectiveIds.length === 0) return 'none';
  const effectiveSet = new Set(effectiveIds.map((id) => id.toString()));
  let best: AccessLevel = 'none';
  for (const perm of permissions) {
    if (effectiveSet.has(perm.groupId.toString())) {
      const rank = ACCESS_RANK[perm.access as AccessLevel] ?? 0;
      if (rank > ACCESS_RANK[best]) best = perm.access as AccessLevel;
    }
  }
  return best;
}

async function computeChannelAccessLevel(userId: string, channel: string): Promise<AccessLevel> {
  await dbReady;
  const db = mongoClient.db();

  const channelDoc = await db.collection('channels').findOne({ channelId: channel });
  if (!channelDoc) return 'none';

  // Stateless channel (no artifact): only the channel owner has access
  if (!channelDoc['artifactId']) {
    return channelDoc['userId'] === userId ? 'read' : 'none';
  }

  const artifact = await db.collection('artifacts').findOne(
    { _id: channelDoc['artifactId'] },
    { projection: { userId: 1, permissions: 1, userPermissions: 1, permissionManagerMode: 1 } }
  );
  if (!artifact) return 'none';

  if (artifact['permissionManagerMode'] !== 'group_admin' && artifact['userId'] === userId) return 'admin';

  const userPerms = (artifact['userPermissions'] as Array<{ userId: string; access: string }> | undefined) ?? [];
  const userLevel: AccessLevel = (userPerms.find((p) => p.userId === userId)?.access as AccessLevel) ?? 'none';

  const groupLevel = await computeGroupAccessLevel(
    userId,
    (artifact['permissions'] as Array<{ groupId: ObjectId; access: string }> | undefined) ?? []
  );

  return ACCESS_RANK[userLevel] >= ACCESS_RANK[groupLevel] ? userLevel : groupLevel;
}

const cacheInvalidator: { fn?: (name: string) => void } = {};
const executeQuery = createQueryExecutor({
  mongoClient,
  dbReady,
  configDir: WORKFLOW_CONFIG_DIR,
  logWorkflowStep,
  invalidateWorkflowConfig: (name) => cacheInvalidator.fn?.(name),
});
const persistToDatabase = createDatabasePersistor({ mongoClient, dbReady, logWorkflowStep });

const aiEventManager = new AIEventManager({ logWorkflowStep, handleInboundEvent });

const engine = new WorkflowEngine(
  {
    publishToClient,
    persistToDatabase,
    logWorkflowStep,
    sendToAi: (channel, text, senderEmail, aiConfig: AiStepConfig, user, correlationId, history) => {
      const msg: ValidateTextMessage = {
        type: 'validate-text',
        from: 'server',
        to: 'ai-service',
        channel,
        timestamp: new Date().toISOString(),
        text,
        senderEmail,
        correlationId,
        history,
      };
      aiEventManager.publish(msg, aiConfig, user as { id: string; email: string } | undefined);
    },
    getChannelContext,
    getArtifactState,
    executeQuery,
    fetchCustomWorkflowConfig,
  },
  WORKFLOW_CONFIG_DIR
);
cacheInvalidator.fn = (name) => engine.invalidateConfig(name);

// Single entry point into workflow execution — called both from the gateway's
// POST /internal/events and, in-process, when an AI response needs to re-enter
// the pipeline (see AIEventManager). Replaces the old worker_threads
// parentPort.on('message', ...) listener with a plain reusable function.
async function handleInboundEvent(input: EventProcessorRequest): Promise<void> {
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
    const userId = (user as Record<string, unknown> | undefined)?.['id'] as string | undefined;
    const channel = message['channel'] as string | undefined;
    let permissionLevel: AccessLevel = 'none';
    if (userId && channel) {
      permissionLevel = await accessLevelCache.get(userId, channel, () => computeChannelAccessLevel(userId, channel));
    }
    await engine.execute({ message, user, permissionLevel }, parentExecutionId, parentStepIndex);
  } catch (err) {
    logWorkflowStep({ createdAt: new Date(), channel: (message['channel'] as string) || '', docType: '', handlerName: (message['type'] as string) || '', logType: 'error', errorMessage: 'WorkflowEngine execution error', errorDetail: String(err) });
  }
}

const app = createApp(handleInboundEvent);

const server = app.listen(env.PROCESSOR_PORT, () => {
  console.log(`event-processor listening on port ${env.PROCESSOR_PORT}`);
});

function shutdown(): void {
  server.close();
  void mongoClient.close();
  redis.disconnect();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
