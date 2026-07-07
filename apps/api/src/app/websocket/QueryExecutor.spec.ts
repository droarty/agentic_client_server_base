import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { createQueryExecutor } from './QueryExecutor';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

let mongod: MongoMemoryServer;
let client: MongoClient;
let configDir: string;
let logWorkflowStep: jest.Mock;

const USER_ID = 'u-1';
const OTHER_USER_ID = 'u-2';
const CHANNEL = 'ch-1';

function makeContext(userId: string | undefined, message: Record<string, unknown> = {}, targetChannelId?: string): WorkflowContext {
  return {
    message: { channel: CHANNEL, type: 'test', ...message },
    user: userId !== undefined ? { id: userId, email: 'test@example.com' } : undefined,
    targetChannelId,
  };
}

async function insertArtifact(overrides: Record<string, unknown> = {}, channelId = CHANNEL) {
  const { currentChannelId: _ignored, ...rest } = overrides as { currentChannelId?: string; [k: string]: unknown };
  const doc = {
    name: 'Test Doc',
    type: 'configged-chat',
    userId: USER_ID,
    state: { title: 'hello' },
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  };
  const result = await client.db().collection('artifacts').insertOne(doc as any);
  await client.db().collection('channels').insertOne({
    channelId,
    workflowType: (doc.type as string) ?? 'configged-chat',
    userId: doc.userId,
    artifactId: result.insertedId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { ...doc, _id: result.insertedId };
}

async function insertLog(overrides: Record<string, unknown> = {}) {
  const doc = {
    createdAt: new Date(),
    channel: CHANNEL,
    docType: 'configged-chat',
    handlerName: 'testHandler',
    logType: 'handler',
    executionId: 'exec-1',
    parentExecutionId: null,
    stepIndex: 0,
    ...overrides,
  };
  const result = await client.db().collection('workflowlogs').insertOne(doc as any);
  return { ...doc, _id: result.insertedId };
}

function makeExecutor() {
  return createQueryExecutor({
    mongoClient: client,
    dbReady: Promise.resolve(client),
    configDir,
    logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();

  configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qe-test-'));
  fs.writeFileSync(path.join(configDir, 'configged-chat.json'), JSON.stringify({ initialState: { messages: [] } }));
  fs.writeFileSync(path.join(configDir, 'log-review.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(configDir, 'user-dashboard.json'), JSON.stringify({}));
}, 30000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
  fs.rmSync(configDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await client.db().collection('artifacts').deleteMany({});
  await client.db().collection('channels').deleteMany({});
  await client.db().collection('workflowlogs').deleteMany({});
  await client.db().collection('users').deleteMany({});
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
    await insertArtifact({ name: 'Mine', userId: USER_ID, type: 'configged-chat' });
    await insertArtifact({ name: 'Dashboard', userId: USER_ID, type: 'user-dashboard' });
    await insertArtifact({ name: 'Theirs', userId: OTHER_USER_ID, type: 'configged-chat' });
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
    const result = await execute('get-document', makeContext(USER_ID, { documentId: String(artifact._id) }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('ById');
  });

  test('finds document by channel', async () => {
    await insertArtifact({ name: 'ByChannel' }, 'ch-special');
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(USER_ID, { channel: 'ch-special' }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('ByChannel');
  });

  test('returns null when userId does not match', async () => {
    const artifact = await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document', makeContext(OTHER_USER_ID, { documentId: String(artifact._id) }));
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
    const result = await execute('get-document-summary', makeContext(USER_ID, { documentId: String(artifact._id) }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['name']).toBe('Summary');
    expect(doc['state']).toBeUndefined();
  });

  test('finds by channel', async () => {
    await insertArtifact({ name: 'SumByChannel' }, 'ch-sum');
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(USER_ID, { channel: 'ch-sum' }));
    expect((result['document'] as Record<string, unknown>)['name']).toBe('SumByChannel');
  });

  test('returns null on ownership mismatch', async () => {
    const artifact = await insertArtifact();
    const execute = makeExecutor();
    const result = await execute('get-document-summary', makeContext(OTHER_USER_ID, { documentId: String(artifact._id) }));
    expect(result['document']).toBeNull();
  });
});

// ─── get-users ────────────────────────────────────────────────────────────────

describe('get-users', () => {
  test('returns all users regardless of caller', async () => {
    await client.db().collection('users').insertMany([
      { email: 'a@test.com', roles: [] },
      { email: 'b@test.com', roles: ['admin'] },
    ]);
    const execute = makeExecutor();
    const result = await execute('get-users', makeContext(undefined));
    expect((result['users'] as unknown[]).length).toBe(2);
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
    const persisted = await client.db().collection('artifacts').findOne({ name: 'New Chat' });
    expect(persisted!['state']).toEqual({ messages: [] });
  });

  test('creates document without state when config has no initialState', async () => {
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Log', documentType: 'log-review' }));
    const doc = result['document'] as Record<string, unknown>;
    expect(doc['name']).toBe('Log');
    const persisted = await client.db().collection('artifacts').findOne({ name: 'Log' });
    expect(persisted!['state']).toBeUndefined();
  });

  test('defaults type to configged-chat when documentType not provided', async () => {
    const execute = makeExecutor();
    await execute('create-document', makeContext(USER_ID, { name: 'Default Type' }));
    const persisted = await client.db().collection('artifacts').findOne({ name: 'Default Type' });
    expect(persisted!['type']).toBe('configged-chat');
  });

  test('returned documents list only includes the creating user\'s non-excluded docs', async () => {
    await insertArtifact({ userId: OTHER_USER_ID });
    const execute = makeExecutor();
    const result = await execute('create-document', makeContext(USER_ID, { name: 'Mine' }));
    const docs = result['documents'] as Array<Record<string, unknown>>;
    expect(docs.every((d) => d['userId'] === USER_ID)).toBe(true);
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
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, 'no-such-channel'));
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
    await insertLog({ channel: CHANNEL, createdAt: older, handlerName: 'older', executionId: 'exec-older', parentExecutionId: null, logType: 'handler' });
    await insertLog({ channel: CHANNEL, createdAt: newer, handlerName: 'newer', executionId: 'exec-newer', parentExecutionId: null, logType: 'handler' });
    await insertLog({ channel: CHANNEL, parentExecutionId: 'exec-parent', logType: 'handler' });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    expect(treeData).toHaveLength(2);
    expect(treeData[0]['name']).toBe('handler: newer');
    expect(treeData[1]['name']).toBe('handler: older');
  });

  test('nests route and sub-handler children correctly for each root', async () => {
    await insertArtifact();
    await insertLog({ handlerName: 'root', executionId: 'exec-root' });
    await client.db().collection('workflowlogs').insertOne({
      channel: CHANNEL, executionId: 'exec-root', logType: 'route', stepIndex: 0,
      route: 'database-query', createdAt: new Date(),
    } as any);
    await client.db().collection('workflowlogs').insertOne({
      channel: CHANNEL, parentExecutionId: 'exec-root', stepIndex: 0,
      logType: 'handler', handlerName: 'childHandler', executionId: 'exec-child',
      createdAt: new Date(),
    } as any);
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    const rootChildren = treeData[0]['children'] as Array<Record<string, unknown>>;
    expect(rootChildren).toHaveLength(1);
    const routeChildren = rootChildren[0]['children'] as Array<Record<string, unknown>>;
    expect(routeChildren[0]['name']).toBe('handler: childHandler');
  });

  test('returns logs for a stateless channel (no artifactId), owned via channel.userId', async () => {
    await client.db().collection('channels').insertOne({
      channelId: CHANNEL, workflowType: 'workflow-builder', userId: USER_ID, isSessionChannel: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    await insertLog({ handlerName: 'statelessRoot', executionId: 'exec-stateless' });
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    const treeData = result['treeData'] as Array<Record<string, unknown>>;
    expect(treeData).toHaveLength(1);
    expect(treeData[0]['name']).toBe('handler: statelessRoot');
    expect(result['artifactState']).toBeNull();
  });

  test('returns empty treeData when a stateless channel belongs to another user', async () => {
    await client.db().collection('channels').insertOne({
      channelId: CHANNEL, workflowType: 'workflow-builder', userId: OTHER_USER_ID, isSessionChannel: true,
      createdAt: new Date(), updatedAt: new Date(),
    } as any);
    const execute = makeExecutor();
    const result = await execute('get-channel-log-tree', makeContext(USER_ID, {}, CHANNEL));
    expect(result['treeData']).toEqual([]);
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
    const badClient = { db: () => { throw new Error('db exploded'); } } as unknown as MongoClient;
    const execute = createQueryExecutor({
      mongoClient: badClient,
      dbReady: Promise.resolve(badClient),
      configDir,
      logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
    });
    const result = await execute('get-user-documents', makeContext(USER_ID));
    expect(result).toEqual({});
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});
