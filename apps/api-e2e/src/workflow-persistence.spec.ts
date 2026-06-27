import * as path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, Document } from 'mongodb';
import { WorkflowEngine, WorkflowEngineDeps } from '../../api/src/app/websocket/WorkflowEngine';
import { createDatabasePersistor } from '../../api/src/app/websocket/DatabasePersistor';

const CONFIG_DIR = path.resolve(__dirname, '../../api/src/app/config/workflows');
const CHANNEL = 'persist-ch-1';
const USER_ID = 'u-persist-1';

let mongod: MongoMemoryServer;
let client: MongoClient;
let engine: WorkflowEngine;
let publishToClient: jest.Mock;

async function getArtifact(): Promise<Document | null> {
  return client.db().collection('artifacts').findOne({ currentChannelId: CHANNEL });
}

const BASE_STATE = {
  openDocs: [] as unknown[],
  activeDocId: '',
  openAccordions: { documents: 'documents', groups: 'groups' },
};

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = new MongoClient(mongod.getUri());
  await client.connect();

  const persistToDatabase = createDatabasePersistor({
    mongoClient: client,
    dbReady: Promise.resolve(client),
    logWorkflowStep: jest.fn(),
    checkWriteAccess: jest.fn().mockResolvedValue(true),
  });

  publishToClient = jest.fn().mockResolvedValue(undefined);

  const deps: WorkflowEngineDeps = {
    publishToClient,
    persistToDatabase,
    sendToAi: jest.fn(),
    getDocumentType: jest.fn().mockResolvedValue('user-dashboard'),
  };

  engine = new WorkflowEngine(deps, CONFIG_DIR);
}, 30000);

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  publishToClient.mockClear();
  await client.db().collection('artifacts').deleteMany({});
  await client.db().collection('artifacts').insertOne({
    currentChannelId: CHANNEL,
    userId: USER_ID,
    state: { ...BASE_STATE, openDocs: [], openAccordions: { documents: 'documents', groups: 'groups' } },
  });
});

const ctx = (type: string, extra: Record<string, unknown> = {}) => ({
  message: { type, channel: CHANNEL, ...extra },
  user: { id: USER_ID, email: 'test@example.com' },
});

// ─── save-documents-accordion ─────────────────────────────────────────────────

describe('save-documents-accordion', () => {
  test('updates state.openAccordions.documents in MongoDB', async () => {
    await engine.execute(ctx('save-documents-accordion', { id: 'groups' }));

    const doc = await getArtifact();
    expect(doc?.state?.openAccordions?.documents).toBe('groups');
  });

  test('also publishes update-state to client', async () => {
    await engine.execute(ctx('save-documents-accordion', { id: 'groups' }));
    expect(publishToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update-state' })
    );
  });
});

// ─── save-groups-accordion ────────────────────────────────────────────────────

describe('save-groups-accordion', () => {
  test('updates state.openAccordions.groups in MongoDB', async () => {
    await engine.execute(ctx('save-groups-accordion', { id: 'documents' }));

    const doc = await getArtifact();
    expect(doc?.state?.openAccordions?.groups).toBe('documents');
  });
});

// ─── display-document-result ──────────────────────────────────────────────────

describe('display-document-result', () => {
  const DOC = { _id: 'doc-abc', name: 'Test Document', currentChannelId: 'doc-chan-1' };

  test('upserts document into state.openDocs', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));

    const doc = await getArtifact();
    const openDocs = doc?.state?.openDocs as unknown[];
    expect(openDocs).toHaveLength(1);
    expect(openDocs[0]).toMatchObject({ _id: 'doc-abc', name: 'Test Document' });
  });

  test('sets state.activeDocId to the document _id', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));

    const doc = await getArtifact();
    expect(doc?.state?.activeDocId).toBe('doc-abc');
  });

  test('upsert replaces existing doc with same _id', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));
    await engine.execute(ctx('display-document-result', { document: { ...DOC, name: 'Renamed' } }));

    const doc = await getArtifact();
    const openDocs = doc?.state?.openDocs as unknown[];
    expect(openDocs).toHaveLength(1);
    expect((openDocs[0] as Record<string, unknown>)['name']).toBe('Renamed');
  });
});

// ─── close-tab ────────────────────────────────────────────────────────────────

describe('close-tab', () => {
  const OPEN_DOC = { _id: 'doc-to-close', name: 'Close Me', currentChannelId: 'close-chan' };

  beforeEach(async () => {
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $set: { 'state.openDocs': [OPEN_DOC] } }
    );
  });

  test('removes the document from state.openDocs', async () => {
    await engine.execute(ctx('close-tab', { _id: 'doc-to-close' }));

    const doc = await getArtifact();
    expect(doc?.state?.openDocs).toHaveLength(0);
  });

  test('leaves other open docs untouched', async () => {
    const OTHER = { _id: 'other-doc', name: 'Keep Me', currentChannelId: 'other-chan' };
    await client.db().collection('artifacts').updateOne(
      { currentChannelId: CHANNEL },
      { $push: { 'state.openDocs': OTHER } } as any
    );

    await engine.execute(ctx('close-tab', { _id: 'doc-to-close' }));

    const doc = await getArtifact();
    expect(doc?.state?.openDocs).toHaveLength(1);
    expect((doc?.state?.openDocs as unknown[])[0]).toMatchObject({ _id: 'other-doc' });
  });
});

// ─── client-only steps do not write to MongoDB ────────────────────────────────

describe('client-only handler', () => {
  test('defaultView does not modify the artifact in MongoDB', async () => {
    const before = await getArtifact();
    await engine.execute(ctx('defaultView'));
    const after = await getArtifact();

    expect(after?.state).toEqual(before?.state);
  });
});
