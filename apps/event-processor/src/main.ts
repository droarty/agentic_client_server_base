import 'dotenv/config';
import { pack } from 'msgpackr';
import Redis from 'ioredis';
import { eq, and, inArray, lt } from 'drizzle-orm';
import {
  createDb,
  channels,
  artifacts,
  artifactGroupPermissions,
  artifactUserPermissions,
  groups,
  memberships,
  workflowConfigs,
  workflowLogs,
} from '@agentic-client-server-base/db-schema';
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

const { db, pool } = createDb(env.DATABASE_URL);

// No TTL-index equivalent in Postgres — prune old workflow_logs rows on a
// periodic app-level job instead of relying on DB-side expiry.
const WORKFLOW_LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
async function pruneOldWorkflowLogs(): Promise<void> {
  try {
    await db.delete(workflowLogs).where(lt(workflowLogs.createdAt, new Date(Date.now() - WORKFLOW_LOG_RETENTION_MS)));
  } catch (err) {
    console.error('pruneOldWorkflowLogs error:', err);
  }
}
void pruneOldWorkflowLogs();
const pruneInterval = setInterval(pruneOldWorkflowLogs, 60 * 60 * 1000);

function logWorkflowStep(entry: WorkflowLogEntry): void {
  db.insert(workflowLogs)
    .values({
      channel: entry.channel,
      docType: entry.docType,
      handlerName: entry.handlerName,
      logType: entry.logType,
      executionId: entry.executionId,
      parentExecutionId: entry.parentExecutionId,
      stepIndex: entry.stepIndex,
      message: entry.message,
      user: entry.user,
      handlerConfig: entry.handlerConfig as object | undefined,
      route: entry.route,
      resolvedMessage: entry.resolvedMessage,
      errorMessage: entry.errorMessage,
      errorDetail: entry.errorDetail as object | undefined,
      createdAt: entry.createdAt,
    })
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
    const [doc] = await db.select().from(channels).where(eq(channels.channelId, channel));
    if (!doc) return null;
    return {
      workflowType: doc.workflowType,
      artifactId: doc.artifactId ?? undefined,
      groupId: doc.groupId ?? undefined,
      userId: doc.userId,
      parentChannelId: doc.parentChannelId ?? undefined,
      responseHandler: doc.responseHandler ?? undefined,
      targetChannelId: doc.targetChannelId ?? undefined,
    };
  } catch {
    return null;
  }
}

async function getArtifactState(artifactId: string): Promise<Record<string, unknown> | null> {
  try {
    const [doc] = await db.select({ state: artifacts.state }).from(artifacts).where(eq(artifacts.id, artifactId));
    return (doc?.state as Record<string, unknown> | undefined) ?? null;
  } catch {
    return null;
  }
}

async function fetchCustomWorkflowConfig(docType: string) {
  try {
    const [row] = await db.select().from(workflowConfigs).where(eq(workflowConfigs.name, docType));
    if (!row) return null;
    return { name: row.name, version: row.version, handlers: row.handlers as Record<string, never> };
  } catch {
    return null;
  }
}

async function getEffectiveGroupIds(userId: string): Promise<string[]> {
  const membershipRows = await db.select({ groupId: memberships.groupId }).from(memberships).where(eq(memberships.userId, userId));
  if (membershipRows.length === 0) return [];
  const directIds = membershipRows.map((m) => m.groupId);
  const groupRows = await db.select({ ancestors: groups.ancestors }).from(groups).where(inArray(groups.id, directIds));
  const allIds = new Set<string>(directIds);
  for (const g of groupRows) {
    for (const anc of g.ancestors) allIds.add(anc);
  }
  return [...allIds];
}

async function computeGroupAccessLevel(
  userId: string,
  permissions: Array<{ groupId: string; access: string }>
): Promise<AccessLevel> {
  const effectiveIds = await getEffectiveGroupIds(userId);
  if (effectiveIds.length === 0) return 'none';
  const effectiveSet = new Set(effectiveIds);
  let best: AccessLevel = 'none';
  for (const perm of permissions) {
    if (effectiveSet.has(perm.groupId)) {
      const rank = ACCESS_RANK[perm.access as AccessLevel] ?? 0;
      if (rank > ACCESS_RANK[best]) best = perm.access as AccessLevel;
    }
  }
  return best;
}

async function computeChannelAccessLevel(userId: string, channel: string): Promise<AccessLevel> {
  const [channelDoc] = await db.select().from(channels).where(eq(channels.channelId, channel));
  if (!channelDoc) return 'none';

  // Stateless channel (no artifact): only the channel owner has access
  if (!channelDoc.artifactId) {
    return channelDoc.userId === userId ? 'read' : 'none';
  }

  const [artifact] = await db
    .select({ userId: artifacts.userId, permissionManagerMode: artifacts.permissionManagerMode })
    .from(artifacts)
    .where(eq(artifacts.id, channelDoc.artifactId));
  if (!artifact) return 'none';

  if (artifact.permissionManagerMode !== 'group_admin' && artifact.userId === userId) return 'admin';

  const [userPerm] = await db
    .select({ access: artifactUserPermissions.access })
    .from(artifactUserPermissions)
    .where(and(eq(artifactUserPermissions.artifactId, channelDoc.artifactId), eq(artifactUserPermissions.userId, userId)));
  const userLevel: AccessLevel = userPerm?.access ?? 'none';

  const groupPerms = await db
    .select({ groupId: artifactGroupPermissions.groupId, access: artifactGroupPermissions.access })
    .from(artifactGroupPermissions)
    .where(eq(artifactGroupPermissions.artifactId, channelDoc.artifactId));
  const groupLevel = await computeGroupAccessLevel(userId, groupPerms);

  return ACCESS_RANK[userLevel] >= ACCESS_RANK[groupLevel] ? userLevel : groupLevel;
}

const cacheInvalidator: { fn?: (name: string) => void } = {};
const executeQuery = createQueryExecutor({
  db,
  configDir: WORKFLOW_CONFIG_DIR,
  logWorkflowStep,
  invalidateWorkflowConfig: (name) => cacheInvalidator.fn?.(name),
});
const persistToDatabase = createDatabasePersistor({ db, logWorkflowStep });

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
  clearInterval(pruneInterval);
  void pool.end();
  redis.disconnect();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
