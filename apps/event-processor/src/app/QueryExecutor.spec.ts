import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, artifacts, channels, users, workflowLogs, assets, serviceTokens, GOOGLE_PHOTOS_TOKEN_TYPE, type Database } from '@agentic-client-server-base/db-schema';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { createQueryExecutor } from './QueryExecutor';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';
import * as googlePhotosPickerClient from './services/google-photos-picker.client';

// hasGooglePhotosConnection is a pure DB read (like get-user-assets) — kept
// real rather than mocked, so its test exercises the actual query against
// the test database. Everything else in this module calls Google's real
// HTTP APIs and stays mocked.
jest.mock('./services/google-photos-picker.client', () => ({
  ...jest.requireActual('./services/google-photos-picker.client'),
  getValidAccessToken: jest.fn(),
  createPickerSession: jest.fn(),
  getPickerSessionStatus: jest.fn(),
  listPickedMediaItems: jest.fn(),
  parsePollIntervalSeconds: jest.fn(),
}));
const mockedPickerClient = jest.mocked(googlePhotosPickerClient);

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

async function insertAsset(overrides: Partial<typeof assets.$inferInsert> = {}) {
  const [asset] = await db
    .insert(assets)
    .values({
      userId: USER_ID,
      assetType: 'google_photo',
      name: 'test.jpg',
      sourceUrl: 'https://example.com/base',
      sourceId: randomUUID(),
      metadata: {},
      ...overrides,
    })
    .returning();
  return asset;
}

async function insertGooglePhotosToken(overrides: Partial<typeof serviceTokens.$inferInsert> = {}) {
  const [token] = await db
    .insert(serviceTokens)
    .values({
      userId: USER_ID,
      tokenType: GOOGLE_PHOTOS_TOKEN_TYPE,
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      scope: 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
      ...overrides,
    })
    .returning();
  return token;
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
  fs.writeFileSync(path.join(configDir, 'asset-browser.json'), JSON.stringify({}));
  fs.writeFileSync(path.join(configDir, 'google-photos-picker.json'), JSON.stringify({}));
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
  await db.delete(assets);
  await db.delete(serviceTokens);
  await db.delete(users);
  const [u1] = await db.insert(users).values({ email: `u1-${randomUUID()}@test.com` }).returning();
  const [u2] = await db.insert(users).values({ email: `u2-${randomUUID()}@test.com` }).returning();
  USER_ID = u1.id;
  OTHER_USER_ID = u2.id;
  logWorkflowStep = jest.fn();
  jest.clearAllMocks();
  mockedPickerClient.parsePollIntervalSeconds.mockImplementation((v) => (v ? Math.ceil(parseFloat(v)) : 5));
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

  test('excludes asset-browser and google-photos-picker (each has its own dedicated entry point, not the generic create-document flow)', async () => {
    const execute = makeExecutor();
    const result = await execute('get-available-types', makeContext(USER_ID));
    expect((result['availableTypes'] as string[]).includes('asset-browser')).toBe(false);
    expect((result['availableTypes'] as string[]).includes('google-photos-picker')).toBe(false);
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

// ─── get-user-assets ──────────────────────────────────────────────────────────

describe('get-user-assets', () => {
  test('returns only the calling user\'s assets, mapped to publicId', async () => {
    const mine = await insertAsset({ name: 'mine.jpg' });
    await insertAsset({ userId: OTHER_USER_ID, name: 'theirs.jpg', sourceId: randomUUID() });
    const execute = makeExecutor();
    const result = await execute('get-user-assets', makeContext(USER_ID));
    const returned = result['assets'] as Array<Record<string, unknown>>;
    expect(returned).toHaveLength(1);
    expect(returned[0]['publicId']).toBe(mine.publicId);
    expect(returned[0]['name']).toBe('mine.jpg');
    expect(returned[0]).not.toHaveProperty('userId');
    expect(returned[0]['addedByEmail']).toBeDefined();
  });

  test('filters by assetType when provided', async () => {
    await insertAsset({ assetType: 'google_photo', sourceId: randomUUID() });
    await insertAsset({ assetType: 'google_video', sourceId: randomUUID() });
    const execute = makeExecutor();
    const result = await execute('get-user-assets', makeContext(USER_ID, { assetType: 'google_video' }));
    const returned = result['assets'] as Array<Record<string, unknown>>;
    expect(returned).toHaveLength(1);
    expect(returned[0]['assetType']).toBe('google_video');
  });

  test('returns empty array when unauthenticated', async () => {
    const execute = makeExecutor();
    const result = await execute('get-user-assets', makeContext(undefined));
    expect(result['assets']).toEqual([]);
  });
});

// ─── get-google-photos-connection-status ─────────────────────────────────────

describe('get-google-photos-connection-status', () => {
  test('returns connected: false when the user has no token', async () => {
    const execute = makeExecutor();
    const result = await execute('get-google-photos-connection-status', makeContext(USER_ID));
    expect(result).toEqual({ connected: false });
  });

  test('returns connected: true when a token row exists, regardless of expiry', async () => {
    await insertGooglePhotosToken({ expiresAt: new Date(Date.now() - 60 * 60 * 1000) });
    const execute = makeExecutor();
    const result = await execute('get-google-photos-connection-status', makeContext(USER_ID));
    expect(result).toEqual({ connected: true });
  });

  test('returns connected: false when unauthenticated', async () => {
    const execute = makeExecutor();
    const result = await execute('get-google-photos-connection-status', makeContext(undefined));
    expect(result).toEqual({ connected: false });
  });
});

// ─── create-google-photos-picker-session ─────────────────────────────────────

describe('create-google-photos-picker-session', () => {
  test('returns an error when the user has not connected Google Photos', async () => {
    const execute = makeExecutor();
    const result = await execute('create-google-photos-picker-session', makeContext(USER_ID));
    expect(result['error']).toBe('Google Photos is not connected');
    expect(mockedPickerClient.createPickerSession).not.toHaveBeenCalled();
  });

  test('creates a session and maps the poll interval when connected', async () => {
    await insertGooglePhotosToken();
    mockedPickerClient.getValidAccessToken.mockResolvedValue('valid-access-token');
    mockedPickerClient.createPickerSession.mockResolvedValue({
      id: 'session-1',
      pickerUri: 'https://photos.google.com/picker/session-1',
      pollingConfig: { pollInterval: '5s' },
      expireTime: '2030-01-01T00:00:00Z',
    });
    const execute = makeExecutor();
    const result = await execute('create-google-photos-picker-session', makeContext(USER_ID));
    expect(result).toEqual({
      sessionId: 'session-1',
      pickerUri: 'https://photos.google.com/picker/session-1',
      pollIntervalSeconds: 5,
      expireTime: '2030-01-01T00:00:00Z',
    });
  });
});

// ─── get-picker-session-status ────────────────────────────────────────────────

describe('get-picker-session-status', () => {
  test('returns mediaItemsSet false when no session id is in state', async () => {
    const execute = makeExecutor();
    const result = await execute('get-picker-session-status', { message: { channel: CHANNEL }, user: { id: USER_ID } });
    expect(result).toEqual({ mediaItemsSet: false });
    expect(mockedPickerClient.getPickerSessionStatus).not.toHaveBeenCalled();
  });

  test('reads the session id from persisted state and reports status', async () => {
    await insertGooglePhotosToken();
    mockedPickerClient.getValidAccessToken.mockResolvedValue('valid-access-token');
    mockedPickerClient.getPickerSessionStatus.mockResolvedValue({
      id: 'session-1',
      pickerUri: '',
      expireTime: '2030-01-01T00:00:00Z',
      mediaItemsSet: true,
    });
    const execute = makeExecutor();
    const result = await execute('get-picker-session-status', {
      message: { channel: CHANNEL },
      user: { id: USER_ID },
      state: { googlePhotosSessionId: 'session-1' },
    });
    expect(result).toEqual({ sessionId: 'session-1', mediaItemsSet: true });
    expect(mockedPickerClient.getPickerSessionStatus).toHaveBeenCalledWith('valid-access-token', 'session-1');
  });
});

// ─── save-picked-media-items ──────────────────────────────────────────────────

describe('save-picked-media-items', () => {
  test('maps picked items into assets rows', async () => {
    await insertGooglePhotosToken();
    mockedPickerClient.getValidAccessToken.mockResolvedValue('valid-access-token');
    mockedPickerClient.listPickedMediaItems.mockResolvedValue([
      {
        id: 'media-1',
        createTime: '2026-01-01T00:00:00Z',
        type: 'PHOTO',
        mediaFile: { baseUrl: 'https://example.com/1', mimeType: 'image/jpeg', filename: 'one.jpg' },
      },
      {
        id: 'media-2',
        createTime: '2026-01-01T00:00:00Z',
        type: 'VIDEO',
        mediaFile: { baseUrl: 'https://example.com/2', mimeType: 'video/mp4', filename: 'two.mp4' },
      },
    ]);
    const execute = makeExecutor();
    const result = await execute('save-picked-media-items', {
      message: { channel: CHANNEL },
      user: { id: USER_ID },
      state: { googlePhotosSessionId: 'session-1' },
    });
    const saved = result['assets'] as Array<Record<string, unknown>>;
    expect(saved).toHaveLength(2);
    expect(saved.find((a) => a['name'] === 'one.jpg')).toMatchObject({
      assetType: 'google_photo',
      sourceUrl: 'https://example.com/1',
      metadata: { id: 'media-1' },
    });
    expect(saved.find((a) => a['name'] === 'two.mp4')).toMatchObject({
      assetType: 'google_video',
      sourceUrl: 'https://example.com/2',
      metadata: { id: 'media-2' },
    });
  });

  test('re-importing the same session does not create duplicate rows', async () => {
    await insertGooglePhotosToken();
    mockedPickerClient.getValidAccessToken.mockResolvedValue('valid-access-token');
    mockedPickerClient.listPickedMediaItems.mockResolvedValue([
      {
        id: 'media-1',
        createTime: '2026-01-01T00:00:00Z',
        type: 'PHOTO',
        mediaFile: { baseUrl: 'https://example.com/1', mimeType: 'image/jpeg', filename: 'one.jpg' },
      },
    ]);
    const execute = makeExecutor();
    const context = { message: { channel: CHANNEL }, user: { id: USER_ID }, state: { googlePhotosSessionId: 'session-1' } };
    await execute('save-picked-media-items', context);
    const secondResult = await execute('save-picked-media-items', context);
    expect((secondResult['assets'] as unknown[])).toHaveLength(1);
    const allRows = await db.select().from(assets).where(eq(assets.userId, USER_ID));
    expect(allRows).toHaveLength(1);
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
