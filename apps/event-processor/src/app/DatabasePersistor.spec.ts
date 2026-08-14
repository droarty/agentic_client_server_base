import * as path from 'path';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, artifacts, channels, users, type Database } from '@agentic-client-server-base/db-schema';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { OutboundMessage } from '@agentic-client-server-base/shared-types';
import { createDatabasePersistor } from './DatabasePersistor';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;
let logWorkflowStep: jest.Mock;
let artifactId: string;
let userId: string;

const CHANNEL_ID = '11111111-1111-1111-1111-111111111111';

function makeOutbound(actions: unknown[], type = 'update-state'): OutboundMessage {
  return { type, channel: CHANNEL_ID, actions } as unknown as OutboundMessage;
}

function makeContext(userIdArg: string | undefined, permissionLevel: WorkflowContext['permissionLevel'] = 'admin'): WorkflowContext {
  return {
    message: { channel: CHANNEL_ID, type: 'update-state' },
    user: userIdArg !== undefined ? { id: userIdArg, email: 'test@example.com' } : undefined,
    permissionLevel,
  };
}

async function getArtifact() {
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, artifactId));
  return row;
}

beforeAll(async () => {
  pgHandle = await startTestPostgres('database_persistor_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../../libs/db-schema/drizzle') });
}, 60000);

afterAll(async () => {
  await pool?.end();
  await pgHandle?.stop();
}, 30000);

beforeEach(async () => {
  await db.delete(channels);
  await db.delete(artifacts);
  await db.delete(users);
  const [user] = await db.insert(users).values({ email: 'db-persistor-test@example.com' }).returning();
  userId = user.id;
  const [artifact] = await db
    .insert(artifacts)
    .values({ name: 'Test', type: 'test', userId, state: { items: [], title: '', meta: {} } })
    .returning();
  artifactId = artifact.id;
  await db.insert(channels).values({ channelId: CHANNEL_ID, workflowType: 'test', userId, artifactId });
  logWorkflowStep = jest.fn();
});

function makePersist() {
  return createDatabasePersistor({
    db,
    logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
  });
}

// ─── Guards ──────────────────────────────────────────────────────────────────

describe('guards — no DB write', () => {
  test('non-update-state message type leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }], 'initialize-client'), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
  });

  test('undefined user leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(undefined));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
  });

  test('empty userId string leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(''));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
  });

  test('empty actions array leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
  });

  test('action path not starting with $state. leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$temp.title', value: 'X' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
  });
});

// ─── Action types ─────────────────────────────────────────────────────────────

describe('update action', () => {
  test('sets a field value', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'Hello' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('Hello');
  });
});

describe('merge action', () => {
  test('merges object keys into field', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'merge', path: '$state.meta', value: { color: 'red', count: 3 } }]), makeContext(userId));
    const doc = await getArtifact();
    const meta = (doc!.state as { meta: { color: string; count: number } }).meta;
    expect(meta.color).toBe('red');
    expect(meta.count).toBe(3);
  });

  test('sets field directly when value is not an object', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'merge', path: '$state.title', value: 'flat' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('flat');
  });
});

describe('append action', () => {
  test('pushes a single item to the array', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'append', path: '$state.items', value: { id: 1 } }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 1 }]);
  });

  test('pushes multiple items when value is an array', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'append', path: '$state.items', value: [{ id: 1 }, { id: 2 }] }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('prepend action', () => {
  test('inserts item at index 0', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 2 }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'prepend', path: '$state.items', value: { id: 1 } }]), makeContext(userId));
    const doc = await getArtifact();
    const items = (doc!.state as { items: unknown[] }).items;
    expect(items[0]).toEqual({ id: 1 });
    expect(items[1]).toEqual({ id: 2 });
  });
});

describe('upsert action', () => {
  test('appends item when no match exists', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'a', name: 'Alpha' }, keys: ['id'] }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  test('updates item in place when single key matches', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a', name: 'Old' }, { id: 'b', name: 'Beta' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'a', name: 'New' }, keys: ['id'] }]), makeContext(userId));
    const doc = await getArtifact();
    const items = (doc!.state as { items: Array<{ id: string; name: string }> }).items;
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ id: 'a', name: 'New' });
    expect(items[1]).toEqual({ id: 'b', name: 'Beta' });
  });

  test('uses multi-key matching correctly', async () => {
    await db.update(artifacts).set({ state: { items: [{ type: 'x', key: '1', val: 'old' }, { type: 'x', key: '2', val: 'keep' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { type: 'x', key: '1', val: 'new' }, keys: ['type', 'key'] }]), makeContext(userId));
    const doc = await getArtifact();
    const items = (doc!.state as { items: Array<{ val: string }> }).items;
    expect(items[0].val).toBe('new');
    expect(items[1].val).toBe('keep');
  });

  test('logs error and leaves array unchanged when keys is missing', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'b' } }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'a' }]);
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('remove action', () => {
  test('removes item matching the key', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a' }, { id: 'b' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'remove', path: '$state.items', value: { id: 'a' }, keys: ['id'] }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'b' }]);
  });

  test('logs error and leaves array unchanged when keys is missing', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'remove', path: '$state.items', value: { id: 'a' } }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'a' }]);
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('update-in action', () => {
  test('patches sub_path on the matching element, leaving others untouched', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a', status: 'old' }, { id: 'b', status: 'keep' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update-in', path: '$state.items', findKey: 'id', findValue: 'a', subPath: 'status', value: 'new' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'a', status: 'new' }, { id: 'b', status: 'keep' }]);
  });

  test('logs error and leaves array unchanged when findKey or subPath is missing', async () => {
    await db.update(artifacts).set({ state: { items: [{ id: 'a', status: 'old' }], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update-in', path: '$state.items', findValue: 'a', value: 'new' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 'a', status: 'old' }]);
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('slice action', () => {
  test('keeps the first n elements (2-arg form)', async () => {
    await db.update(artifacts).set({ state: { items: [0, 1, 2, 3, 4], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'slice', path: '$state.items', start: 2 }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([0, 1]);
  });

  test('takes n elements starting at position (3-arg form)', async () => {
    await db.update(artifacts).set({ state: { items: [0, 1, 2, 3, 4], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'slice', path: '$state.items', start: 1, end: 2 }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([1, 2]);
  });

  test('no-ops when both start and end are undefined', async () => {
    await db.update(artifacts).set({ state: { items: [0, 1, 2], title: '', meta: {} } }).where(eq(artifacts.id, artifactId));
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'slice', path: '$state.items' }]), makeContext(userId));
    const doc = await getArtifact();
    expect((doc!.state as { items: unknown[] }).items).toEqual([0, 1, 2]);
  });
});

describe('multiple actions in one call', () => {
  test('applies update and append together', async () => {
    const persist = makePersist();
    await persist(
      makeOutbound([
        { actionType: 'update', path: '$state.title', value: 'Done' },
        { actionType: 'append', path: '$state.items', value: { id: 1 } },
      ]),
      makeContext(userId)
    );
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('Done');
    expect((doc!.state as { items: unknown[] }).items).toEqual([{ id: 1 }]);
  });
});

// ─── Permission level guard ───────────────────────────────────────────────────

describe('permission level guard', () => {
  test('permissionLevel none leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(userId, 'none'));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('permissionLevel read leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(userId, 'read'));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('');
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });

  test('permissionLevel write allows the write', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'Written' }]), makeContext(userId, 'write'));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('Written');
  });

  test('permissionLevel admin allows the write', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'Admin' }]), makeContext(userId, 'admin'));
    const doc = await getArtifact();
    expect((doc!.state as { title: string }).title).toBe('Admin');
  });
});
