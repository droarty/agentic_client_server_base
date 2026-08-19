import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, artifacts, channels, users, workflowLogs, type Database } from '@agentic-client-server-base/db-schema';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { createQueryExecutor } from './QueryExecutor';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;
let configDir: string;
let logWorkflowStep: jest.Mock;
let USER_ID: string;
let OTHER_USER_ID: string;

// makeContext() always sets message.channel to CHANNEL unless the caller
// overrides it — so any insertArtifact() call relying on that default
// channel lookup (get-document/get-workflow-builder-context/
// get-channel-log-tree) must keep using CHANNEL. Tests that create several
// artifacts without ever querying by channel pass explicit, distinct
// channel ids instead, since channels.channel_id is uniquely constrained.
const CHANNEL = '11111111-1111-1111-1111-111111111111';
const CHANNEL_SPECIAL = '22222222-2222-2222-2222-222222222222';
const CHANNEL_SUM = '33333333-3333-3333-3333-333333333333';
const NONEXISTENT_UUID = '99999999-9999-9999-9999-999999999999';

function makeContext(userId: string | undefined, message: Record<string, unknown> = {}, targetChannelId?: string): WorkflowContext {
  return {
    message: { channel: CHANNEL, type: 'test', ...message },
    user: userId !== undefined ? { id: userId, email: 'test@example.com' } : undefined,
    targetChannelId,
  };
}

async function insertArtifact(overrides: Record<string, unknown> = {}, channelId = CHANNEL) {
  const values = {
    name: 'Test Doc',
    type: 'configged-chat',
    userId: USER_ID,
    state: { title: 'hello' },
    ...overrides,
  };
  const [artifact] = await db.insert(artifacts).values(values as typeof artifacts.$inferInsert).returning();
  await db.insert(channels).values({
    channelId,
    workflowType: (values.type as string) ?? 'configged-chat',
    userId: values.userId as string,
    artifactId: artifact.id,
  });
  return artifact;
}

async function insertLog(overrides: Partial<typeof workflowLogs.$inferInsert> = {}) {
  const [log] = await db
    .insert(workflowLogs)
    .values({
      createdAt: new Date(),
      channel: CHANNEL,
      docType: 'configged-chat',
      handlerName: 'testHandler',
      logType: 'handler',
      executionId: randomUUID(),
      parentExecutionId: null,
      stepIndex: 0,
      ...overrides,
    })
    .returning();
  return log;
}

function makeExecutor() {
  return createQueryExecutor({
    db,
    configDir,
    logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
  });
}

beforeAll(async () => {
  pgHandle = await startTestPostgres('query_executor_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../../libs/db-schema/drizzle') });

  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-test-'));
  fs.writeFileSync(path.join(configDir, 'configged-chat.json'), JSON.stringify({ initialState: { messages: [] } }));
  fs.writeFileSync(path.join(configDir, 'log-review.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(configDir, 'user-dashboard.json'), JSON.stringify({}));
}, 60000);

afterAll(async () => {
  await pool?.end();
  await pgHandle?.stop();
  fs.rmSync(configDir, { recursive: true, force: true });
}, 30000);

beforeEach(async () => {
  await db.delete(workflowLogs);
  await db.delete(channels);
  await db.delete(artifacts);
  await db.delete(users);
  const [u1] = await db.insert(users).values({ email: `u1-${randomUUID()}@test.com` }).returning();
  const [u2] = await db.insert(users).values({ email: `u2-${randomUUID()}@test.com` }).returning();
  USER_ID = u1.id;
  OTHER_USER_ID = u2.id;
  logWorkflowStep = jest.fn();
});

// ─── get-available-types ──────────────────────────────────────────────────────

describe('get-available-types', () => {
  test('returns json filenames from configDir excluding user-dashboard', async () => {
    const execute = makeExecutor();
    const result = await execute('get-available-types', makeContext(USER_ID));
    expect(result['availableTypes']).toEqual(expect.arrayContaining(['configged-chat']));
    expect((result['availableTypes'] as string[]).includes('user-dashboard')).toBe(false);
    expect((result['availableTypes'] as string[]).includes('log-review')).toBe(false);
  });
});

// ─── get-user-documents ───────────────────────────────────────────────────────

describe('get-user-documents', () => {
  test('returns empty array when no userId', async () => {
    await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-user-documents', makeContext(undefined));
    expect(result['documents']).toEqual([]);
  });

  test('returns only the user\'s non-dashboard documents', async () => {
    await insertArtifact({ name: 'Mine', userId: USER_ID, type: 'configged-chat' }, randomUUID());
    await insertArtifact({ name: 'Dashboard', userId: USER_ID, type: 'user-dashboard' }, randomUUID());
    await insertArtifact({ name: 'Theirs', userId: OTHER_USER_ID, type: 'configged-chat' }, randomUUID());
    const execute = makeExecutor();
    const result = await execute('get-user-documents', makeContext(USER_ID));
    const docs = result['documents'] as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(1);
    expect(docs[0]['name']).toBe('Mine');
  });
});

// ─── get-document ─────────────────────────────────────────────────────────────

describe('get-document', () => {
  test('returns null when no userId', async () => {
    await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(undefined));
    expect(result['document']).toBeNull();
  });

  test('finds document by documentId', async () => {
    const artifact = await insertArtifact({ name: 'ById' });
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(USER_ID, { documentId: artifact.id }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('ById');
  });

  test('finds document by channel', async () => {
    await insertArtifact({ name: 'ByChannel' }, CHANNEL_SPECIAL);
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(USER_ID, { channel: CHANNEL_SPECIAL }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('ByChannel');
  });

  test('returns null when userId does not match', async () => {
    const artifact = await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(OTHER_USER_ID, { documentId: artifact.id }));
    expect(result['document']).toBeNull();
  });

  test('returns null when neither documentId nor channel provided', async () => {
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(USER_ID));
    expect(result['document']).toBeNull();
  });
});

// ─── get-document-summary ─────────────────────────────────────────────────────

describe('get-document-summary', () => {
  test('returns null when no userId', async () => {
    await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(undefined));
    expect(result['document']).toBeNull();
  });

  test('finds by documentId and excludes state from result', async () => {
    const artifact = await insertArtifact({ name: 'Summary' });
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(USER_ID, { documentId: artifact.id }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['name']).toBe('Summary');
    expect(doc['state']).toBeUndefined();
  });

  test('finds by channel', async () => {
    await insertArtifact({ name: 'SumByChannel' }, CHANNEL_SUM);
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(USER_ID, { channel: CHANNEL_SUM }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('SumByChannel');
  });

  test('returns null on ownership mismatch', async () => {
    const artifact = await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(OTHER_USER_ID, { documentId: artifact.id }));
    expect(result['document']).toBeNull();
  });
});

// ─── get-users ────────────────────────────────────────────────────────────────

describe('get-users', () => {
  test('returns all users regardless of caller', async () => {
    await db.insert(users).values([{ email: 'a@test.com' }, { email: 'b@test.com' }]);
    const execute = makeExecutor();
    const result = await execute('get-users', makeContext(undefined));
    const emails = (result['users'] as Array<{ email: string }>).map((u) => u.email);
    expect(emails).toEqual(expect.arrayContaining(['a@test.com', 'b@test.com']));
  });
});

// ─── create-document ──────────────────────────────────────────────────────────

describe('create-document', () => {
  test('returns null when name is empty', async () => {
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: '  ' }));
    expect(result['document']).toBeNull();
    expect(result['documents']).toEqual([]);
  });

  test('creates document with initialState from config file', async () => {
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'New Chat', documentType: 'configged-chat' }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['name']).toBe('New Chat');
    expect(doc['type']).toBe('configged-chat');
    const [persisted] = await db.select().from(artifacts).where(eqName('New Chat'));
    expect(persisted!.state).toEqual({ messages: [] });
  });

  test('creates document without state when config has no initialState', async () => {
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Log', documentType: 'log-review' }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['name']).toBe('Log');
    const [persisted] = await db.select().from(artifacts).where(eqName('Log'));
    expect(persisted!.state).toBeNull();
  });

  test('defaults type to configged-chat when documentType not provided', async () => {
    const execute = makeExecutor();
    await execute('create-document', makeContext(USER_ID, { name: 'Default Type' }));
    const [persisted] = await db.select().from(artifacts).where(eqName('Default Type'));
    expect(persisted!.type).toBe('configged-chat');
  });

  test('returned documents list only includes the creating user\'s non-excluded docs', async () => {
    await insertArtifact({ userId: OTHER_USER_ID }, randomUUID());
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Mine' }));
    const docs = result['documents'] as Array<Record<string, unknown>>;
    expect(docs.every((d) => d['userId'] === USER_ID)).toBe(true);
  });

  test('creates document with parentId when parent exists', async () => {
    const parent = await insertArtifact({ name: 'Parent' });
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Child', parentId: parent.id }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['parentId']).toBe(parent.id);
    const [persisted] = await db.select().from(artifacts).where(eqName('Child'));
    expect(persisted!.parentId).toBe(parent.id);
  });

  test('does not create when parentId does not reference an existing artifact', async () => {
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Orphan', parentId: NONEXISTENT_UUID }));
    expect(result['document']).toBeNull();
    const [persisted] = await db.select().from(artifacts).where(eqName('Orphan'));
    expect(persisted).toBeUndefined();
  });
});

// ─── get-child-documents ────────────────────────────────────────────────────

describe('get-child-documents', () => {
  test('returns empty array when userId or parentId missing', async () => {
    const parent = await insertArtifact({ name: 'Parent' });
    const execute = makeExecutor();
    const noUser = await execute('get-child-documents', makeContext(undefined, { parentId: parent.id }));
    expect(noUser['documents']).toEqual([]);
    const noParent = await execute('get-child-documents', makeContext(USER_ID, {}));
    expect(noParent['documents']).toEqual([]);
  });

  test('returns only the caller\'s children of the given parent', async () => {
    const parent = await insertArtifact({ name: 'Parent' }, randomUUID());
    await insertArtifact({ name: 'Mine Child', userId: USER_ID, parentId: parent.id }, randomUUID());
    await insertArtifact({ name: 'Their Child', userId: OTHER_USER_ID, parentId: parent.id }, randomUUID());
    await insertArtifact({ name: 'Unrelated', userId: USER_ID }, randomUUID());
    const execute = makeExecutor();
    const result = await execute('get-child-documents', makeContext(USER_ID, { parentId: parent.id }));
    const docs = result['documents'] as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(1);
    expect(docs[0]['name']).toBe('Mine Child');
    expect(docs[0]['currentChannelId']).toBeTruthy();
  });
});

// ─── get-channel-log-tree ──────────────────────────────────────────────────────

describe('get-channel-log-tree', () => {
  test('returns empty treeData and state when no targetChannelId', async () => {
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID));
    expect(result['treeData']).toEqual([]);
    expect(result['artifactState']).toBeNull();
  });

  test('returns empty treeData when channel not found', async () => {
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, NONEXISTENT_UUID));
    expect(result['treeData']).toEqual([]);
  });

  test('returns empty treeData when document-backed channel belongs to another user', async () => {
    await insertArtifact({ userId: OTHER_USER_ID });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    expect(result['treeData']).toEqual([]);
  });

  test('returns the artifact\'s current state alongside the tree for a document-backed channel', async () => {
    await insertArtifact({ state: { title: 'my state' } });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    expect(result['artifactState']).toEqual({ title: 'my state' });
  });

  test('returns multiple root logs for the channel sorted by createdAt desc', async () => {
    await insertArtifact();
    const older = new Date('2024-01-01');
    const newer = new Date('2024-06-01');
    await insertLog({ channel: CHANNEL, createdAt: older, handlerName: 'older', executionId: randomUUID(), parentExecutionId: null, logType: 'handler' });
    await insertLog({ channel: CHANNEL, createdAt: newer, handlerName: 'newer', executionId: randomUUID(), parentExecutionId: null, logType: 'handler' });
    await insertLog({ channel: CHANNEL, parentExecutionId: randomUUID(), logType: 'handler' });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    expect(treeData).toHaveLength(2);
    expect(treeData[0]['name']).toBe('handler: newer');
    expect(treeData[1]['name']).toBe('handler: older');
  });

  test('nests route and sub-handler children correctly for each root', async () => {
    await insertArtifact();
    const execRoot = randomUUID();
    const execChild = randomUUID();
    await insertLog({ handlerName: 'root', executionId: execRoot });
    await insertLog({ executionId: execRoot, logType: 'route', stepIndex: 0, route: 'database-query' });
    await insertLog({ parentExecutionId: execRoot, stepIndex: 0, logType: 'handler', handlerName: 'childHandler', executionId: execChild });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    const rootChildren = treeData[0]['children'] as Array<Record<string, unknown>>;
    expect(rootChildren).toHaveLength(1);
    const routeChildren = rootChildren[0]['children'] as Array<Record<string, unknown>>;
    expect(routeChildren[0]['name']).toBe('handler: childHandler');
  });

  test('rawData.id is a string on root, route, tool, and sub-handler nodes', async () => {
    await insertArtifact();
    const execRoot = randomUUID();
    const execChild = randomUUID();
    await insertLog({ handlerName: 'root', executionId: execRoot });
    await insertLog({ executionId: execRoot, logType: 'route', stepIndex: 0, route: 'database-query' });
    await insertLog({ executionId: execRoot, stepIndex: 0, logType: 'tool', message: { tool: 'get_reference_section' } });
    await insertLog({ parentExecutionId: execRoot, stepIndex: 0, logType: 'handler', handlerName: 'childHandler', executionId: execChild });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;

    const rootRawData = treeData[0]['rawData'] as Record<string, unknown>;
    expect(typeof rootRawData['id']).toBe('string');

    const rootChildren = treeData[0]['children'] as Array<Record<string, unknown>>;
    const routeRawData = rootChildren[0]['rawData'] as Record<string, unknown>;
    expect(typeof routeRawData['id']).toBe('string');

    const routeChildren = rootChildren[0]['children'] as Array<Record<string, unknown>>;
    const toolNode = routeChildren.find((c) => (c['name'] as string).startsWith('tool:'))!;
    expect(typeof (toolNode['rawData'] as Record<string, unknown>)['id']).toBe('string');

    const subHandlerNode = routeChildren.find((c) => (c['name'] as string).startsWith('handler:'))!;
    expect(typeof (subHandlerNode['rawData'] as Record<string, unknown>)['id']).toBe('string');
  });

  test('returns logs for a stateless channel (no artifactId), owned via channel.userId', async () => {
    await db.insert(channels).values({
      channelId: CHANNEL, workflowType: 'workflow-builder', userId: USER_ID, isSessionChannel: true,
    });
    await insertLog({ handlerName: 'statelessRoot', executionId: randomUUID() });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    expect(treeData).toHaveLength(1);
    expect(treeData[0]['name']).toBe('handler: statelessRoot');
    expect(result['artifactState']).toBeNull();
  });

  test('returns empty treeData when a stateless channel belongs to another user', async () => {
    await db.insert(channels).values({
      channelId: CHANNEL, workflowType: 'workflow-builder', userId: OTHER_USER_ID, isSessionChannel: true,
    });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    expect(result['treeData']).toEqual([]);
  });
});

// ─── get-workflow-builder-context ──────────────────────────────────────────────

describe('get-workflow-builder-context', () => {
  test('defaults to an empty plan and null draftConfig when no state exists', async () => {
    await insertArtifact({ type: 'workflow-builder', state: {} });
    const execute = makeExecutor();
    const result = await execute('get-workflow-builder-context', makeContext(USER_ID));
    expect(result['plan']).toBe('');
    expect(result['draftConfig']).toBeNull();
  });

  test('passes through a persisted plan', async () => {
    await insertArtifact({
      type: 'workflow-builder',
      state: { plan: 'a coin-flip logger' },
    });
    const execute = makeExecutor();
    const result = await execute('get-workflow-builder-context', makeContext(USER_ID));
    expect(result['plan']).toBe('a coin-flip logger');
  });

  test('passes through draftConfig from persisted state', async () => {
    await insertArtifact({
      type: 'workflow-builder',
      state: { draftConfig: { name: 'demo' } },
    });
    const execute = makeExecutor();
    const result = await execute('get-workflow-builder-context', makeContext(USER_ID));
    expect(result['draftConfig']).toEqual({ name: 'demo' });
  });
});

// ─── unknown query ────────────────────────────────────────────────────────────

describe('unknown query name', () => {
  test('returns empty object', async () => {
    const execute = makeExecutor();
    const result = await execute('does-not-exist', makeContext(USER_ID));
    expect(result).toEqual({});
  });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  test('calls logWorkflowStep and returns {} when an error is thrown', async () => {
    const badDb = {
      select: () => {
        throw new Error('db exploded');
      },
    } as unknown as Database;
    const execute = createQueryExecutor({
      db: badDb,
      configDir,
      logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
    });
    const result = await execute('get-user-documents', makeContext(USER_ID));
    expect(result).toEqual({});
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

function eqName(name: string) {
  return eq(artifacts.name, name);
}
