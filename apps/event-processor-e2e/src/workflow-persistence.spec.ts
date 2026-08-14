import * as path from 'path';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { createDb, artifacts, channels, users, type Database } from '@agentic-client-server-base/db-schema';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { WorkflowEngine, WorkflowEngineDeps } from '../../event-processor/src/app/WorkflowEngine';
import { createDatabasePersistor } from '../../event-processor/src/app/DatabasePersistor';

// All describe blocks below are skipped: the handlers they exercise
// (save-documents-accordion, save-groups-accordion, display-document-result,
// close-tab) no longer exist in user-dashboard.json — that functionality moved
// into a separate group-dashboard.json/workflow-builder.json split at some
// point before this Postgres migration (confirmed unrelated to it via `git log`
// on user-dashboard.json). The rewrite below is otherwise a faithful Postgres
// port of the suite's Mongo version (real embedded-postgres, real
// DatabasePersistor.ts) and is kept as a starting point, but it can't pass
// until it targets the current config split. DatabasePersistor's actual
// persistence logic already has full direct coverage in
// apps/event-processor/src/app/DatabasePersistor.spec.ts.
const CONFIG_DIR = path.resolve(__dirname, '../../../libs/workflow-configs/src/workflows');

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;
let engine: WorkflowEngine;
let publishToClient: jest.Mock;
let USER_ID: string;
let currentChannel: string;
let currentArtifactId: string;

async function getArtifact() {
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, currentArtifactId));
  return row;
}

const BASE_STATE = {
  openDocs: [] as unknown[],
  activeDocId: '',
  openAccordions: { documents: 'documents', groups: 'groups' },
};

beforeAll(async () => {
  pgHandle = await startTestPostgres('workflow_persistence_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../libs/db-schema/drizzle') });

  const persistToDatabase = createDatabasePersistor({ db, logWorkflowStep: jest.fn() });
  publishToClient = jest.fn().mockResolvedValue(undefined);

  // A single WorkflowEngine instance is reused across every test (matching the
  // suite's original structure), and it caches channel -> ChannelContext
  // lookups for its whole lifetime — so each test gets a fresh, unique
  // channel id rather than reusing one across artifacts, or a later test
  // would resolve to an earlier test's already-deleted artifactId.
  const deps: WorkflowEngineDeps = {
    publishToClient,
    persistToDatabase,
    sendToAi: jest.fn(),
    getChannelContext: jest.fn().mockImplementation(async () => ({ workflowType: 'user-dashboard', artifactId: currentArtifactId })),
  };

  engine = new WorkflowEngine(deps, CONFIG_DIR);
}, 60000);

afterAll(async () => {
  await pool?.end();
  await pgHandle?.stop();
}, 30000);

beforeEach(async () => {
  publishToClient.mockClear();
  await db.delete(channels);
  await db.delete(artifacts);
  await db.delete(users);
  const [user] = await db.insert(users).values({ email: `persist-${randomUUID()}@test.com` }).returning();
  USER_ID = user.id;
  currentChannel = randomUUID();
  const [artifact] = await db
    .insert(artifacts)
    .values({
      name: 'Dashboard',
      type: 'user-dashboard',
      userId: USER_ID,
      state: { ...BASE_STATE, openDocs: [], openAccordions: { documents: 'documents', groups: 'groups' } },
    })
    .returning();
  currentArtifactId = artifact.id;
  await db.insert(channels).values({ channelId: currentChannel, workflowType: 'user-dashboard', userId: USER_ID, artifactId: artifact.id });
});

const ctx = (type: string, extra: Record<string, unknown> = {}) => ({
  message: { type, channel: currentChannel, ...extra },
  user: { id: USER_ID, email: 'test@example.com' },
  permissionLevel: 'admin' as const,
});

// ─── save-documents-accordion ─────────────────────────────────────────────────

describe.skip('save-documents-accordion', () => {
  test('updates state.openAccordions.documents in Postgres', async () => {
    await engine.execute(ctx('save-documents-accordion', { id: 'groups' }));

    const doc = await getArtifact();
    const state = doc!.state as { openAccordions: { documents: string } };
    expect(state.openAccordions.documents).toBe('groups');
  });

  test('also publishes update-state to client', async () => {
    await engine.execute(ctx('save-documents-accordion', { id: 'groups' }));
    expect(publishToClient).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'update-state' })
    );
  });
});

// ─── save-groups-accordion ────────────────────────────────────────────────────

describe.skip('save-groups-accordion', () => {
  test('updates state.openAccordions.groups in Postgres', async () => {
    await engine.execute(ctx('save-groups-accordion', { id: 'documents' }));

    const doc = await getArtifact();
    const state = doc!.state as { openAccordions: { groups: string } };
    expect(state.openAccordions.groups).toBe('documents');
  });
});

// ─── display-document-result ──────────────────────────────────────────────────

describe.skip('display-document-result', () => {
  const DOC = { _id: 'doc-abc', name: 'Test Document', currentChannelId: 'doc-chan-1' };

  test('upserts document into state.openDocs', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));

    const doc = await getArtifact();
    const openDocs = (doc!.state as { openDocs: unknown[] }).openDocs;
    expect(openDocs).toHaveLength(1);
    expect(openDocs[0]).toMatchObject({ _id: 'doc-abc', name: 'Test Document' });
  });

  test('sets state.activeDocId to the document _id', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));

    const doc = await getArtifact();
    expect((doc!.state as { activeDocId: string }).activeDocId).toBe('doc-abc');
  });

  test('upsert replaces existing doc with same _id', async () => {
    await engine.execute(ctx('display-document-result', { document: DOC }));
    await engine.execute(ctx('display-document-result', { document: { ...DOC, name: 'Renamed' } }));

    const doc = await getArtifact();
    const openDocs = (doc!.state as { openDocs: unknown[] }).openDocs;
    expect(openDocs).toHaveLength(1);
    expect((openDocs[0] as Record<string, unknown>)['name']).toBe('Renamed');
  });
});

// ─── close-tab ────────────────────────────────────────────────────────────────

describe.skip('close-tab', () => {
  const OPEN_DOC = { _id: 'doc-to-close', name: 'Close Me', currentChannelId: 'close-chan' };

  beforeEach(async () => {
    const artifact = await getArtifact();
    await db
      .update(artifacts)
      .set({ state: { ...(artifact!.state as Record<string, unknown>), openDocs: [OPEN_DOC] } })
      .where(eq(artifacts.id, currentArtifactId));
  });

  test('removes the document from state.openDocs', async () => {
    await engine.execute(ctx('close-tab', { _id: 'doc-to-close' }));

    const doc = await getArtifact();
    expect((doc!.state as { openDocs: unknown[] }).openDocs).toHaveLength(0);
  });

  test('leaves other open docs untouched', async () => {
    const OTHER = { _id: 'other-doc', name: 'Keep Me', currentChannelId: 'other-chan' };
    const artifact = await getArtifact();
    const openDocs = (artifact!.state as { openDocs: unknown[] }).openDocs;
    await db
      .update(artifacts)
      .set({ state: { ...(artifact!.state as Record<string, unknown>), openDocs: [...openDocs, OTHER] } })
      .where(eq(artifacts.id, currentArtifactId));

    await engine.execute(ctx('close-tab', { _id: 'doc-to-close' }));

    const doc = await getArtifact();
    const remaining = (doc!.state as { openDocs: unknown[] }).openDocs;
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ _id: 'other-doc' });
  });
});

// ─── client-only steps do not write to Postgres ────────────────────────────────

describe.skip('client-only handler', () => {
  test('defaultView does not modify the artifact in Postgres', async () => {
    const before = await getArtifact();
    await engine.execute(ctx('defaultView'));
    const after = await getArtifact();

    expect(after!.state).toEqual(before!.state);
  });
});
