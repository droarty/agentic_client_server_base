import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Document } from 'mongodb';
import { OutboundMessage } from '@multiplayer-base/shared-types';
import { createDatabasePersistor } from './DatabasePersistor';
import { WorkflowContext, WorkflowLogEntry } from './WorkflowEngine';

let mongod: MongoMemoryServer;
let client: MongoClient;
let logWorkflowStep: jest.Mock;

const CHANNEL = 'ch-1';
const USER_ID = 'u-1';

const SEED = {
  currentChannelId: CHANNEL,
  userId: USER_ID,
  state: { items: [] as unknown[], title: '', meta: {} as Record<string, unknown> },
};

function makeOutbound(actions: unknown[], type = 'update-state'): OutboundMessage {
  return { type, channel: CHANNEL, actions } as unknown as OutboundMessage;
}

function makeContext(userId: string | undefined): WorkflowContext {
  return {
    message: { channel: CHANNEL, type: 'update-state' },
    user: userId !== undefined ? { id: userId, email: 'test@example.com' } : undefined,
  };
}

async function getArtifact(): Promise<Document | null> {
  return client.db().collection('artifacts').findOne({ currentChannelId: CHANNEL });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();
}, 30000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await client.db().collection('artifacts').deleteMany({});
  await client.db().collection('artifacts').insertOne({ ...SEED, state: { items: [], title: '', meta: {} } });
  logWorkflowStep = jest.fn();
});

function makePersist() {
  return createDatabasePersistor({
    mongoClient: client,
    dbReady: Promise.resolve(client),
    logWorkflowStep: logWorkflowStep as unknown as (entry: WorkflowLogEntry) => void,
  });
}

// ─── Guards ──────────────────────────────────────────────────────────────────

describe('guards — no DB write', () => {
  test('non-update-state message type leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }], 'initialize-client'), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });

  test('undefined user leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(undefined));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });

  test('empty userId string leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'X' }]), makeContext(''));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });

  test('empty actions array leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });

  test('action path not starting with $state. leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$temp.title', value: 'X' }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });
});

// ─── Action types ─────────────────────────────────────────────────────────────

describe('update action', () => {
  test('sets a field value', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'Hello' }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('Hello');
  });
});

describe('merge action', () => {
  test('merges object keys into field', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'merge', path: '$state.meta', value: { color: 'red', count: 3 } }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.meta.color).toBe('red');
    expect(doc!.state.meta.count).toBe(3);
  });

  test('sets field directly when value is not an object', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'merge', path: '$state.title', value: 'flat' }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('flat');
  });
});

describe('append action', () => {
  test('pushes a single item to the array', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'append', path: '$state.items', value: { id: 1 } }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 1 }]);
  });

  test('pushes multiple items when value is an array', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'append', path: '$state.items', value: [{ id: 1 }, { id: 2 }] }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 1 }, { id: 2 }]);
  });
});

describe('prepend action', () => {
  test('inserts item at index 0', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ id: 2 }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'prepend', path: '$state.items', value: { id: 1 } }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items[0]).toEqual({ id: 1 });
    expect(doc!.state.items[1]).toEqual({ id: 2 });
  });
});

describe('upsert action', () => {
  test('appends item when no match exists', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'a', name: 'Alpha' }, keys: ['id'] }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 'a', name: 'Alpha' }]);
  });

  test('updates item in place when single key matches', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ id: 'a', name: 'Old' }, { id: 'b', name: 'Beta' }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'a', name: 'New' }, keys: ['id'] }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toHaveLength(2);
    expect(doc!.state.items[0]).toEqual({ id: 'a', name: 'New' });
    expect(doc!.state.items[1]).toEqual({ id: 'b', name: 'Beta' });
  });

  test('uses multi-key matching correctly', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ type: 'x', key: '1', val: 'old' }, { type: 'x', key: '2', val: 'keep' }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { type: 'x', key: '1', val: 'new' }, keys: ['type', 'key'] }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items[0].val).toBe('new');
    expect(doc!.state.items[1].val).toBe('keep');
  });

  test('logs error and leaves array unchanged when keys is missing', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ id: 'a' }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'upsert', path: '$state.items', value: { id: 'b' } }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 'a' }]);
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
  });
});

describe('remove action', () => {
  test('removes item matching the key', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ id: 'a' }, { id: 'b' }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'remove', path: '$state.items', value: { id: 'a' }, keys: ['id'] }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 'b' }]);
  });

  test('logs error and leaves array unchanged when keys is missing', async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.items': [{ id: 'a' }] } }
    );
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'remove', path: '$state.items', value: { id: 'a' } }]), makeContext(USER_ID));
    const doc = await getArtifact();
    expect(doc!.state.items).toEqual([{ id: 'a' }]);
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error' }));
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
      makeContext(USER_ID)
    );
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('Done');
    expect(doc!.state.items).toEqual([{ id: 1 }]);
  });
});

// ─── Ownership ────────────────────────────────────────────────────────────────

describe('ownership', () => {
  test('userId mismatch leaves document unchanged', async () => {
    const persist = makePersist();
    await persist(makeOutbound([{ actionType: 'update', path: '$state.title', value: 'Hacked' }]), makeContext('other-user'));
    const doc = await getArtifact();
    expect(doc!.state.title).toBe('');
  });
});
