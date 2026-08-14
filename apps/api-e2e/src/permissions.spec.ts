import 'dotenv/config';
import * as path from 'path';
import request from 'supertest';
import { Application } from 'express';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import {
  createDb,
  type Database,
  groups,
  memberships,
  membershipRoles,
  artifacts,
  artifactGroupPermissions,
  artifactUserPermissions,
} from '@agentic-client-server-base/db-schema';
import type { AccessLevel } from '@agentic-client-server-base/access-control';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import type { GroupRole } from '@agentic-client-server-base/shared-types';
import { createApp } from '../../api/src/app/app';
import { connectDB, disconnectDB } from '../../api/src/app/db/connect';

let app: Application;
let pgHandle: TestPostgresHandle;
let db: Database;
let fixturePool: Pool;

let ownerToken: string;
let ownerUserId: string;
let otherToken: string;
let otherUserId: string;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-secret';

  pgHandle = await startTestPostgres('api_permissions_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  fixturePool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../libs/db-schema/drizzle') });
  await connectDB(pgHandle.connectionString);
  app = createApp();
}, 60000);

afterAll(async () => {
  await fixturePool?.end();
  await disconnectDB();
  await pgHandle?.stop();
}, 30000);

async function makeGroup(overrides: { name: string; parentGroupId?: string; ancestors?: string[] }) {
  const [group] = await db.insert(groups).values({ name: overrides.name, parentGroupId: overrides.parentGroupId ?? null, ancestors: overrides.ancestors ?? [] }).returning();
  return group;
}

async function makeMembership(userId: string, groupId: string, roles: GroupRole[]) {
  const [membership] = await db.insert(memberships).values({ userId, groupId }).returning();
  if (roles.length) await db.insert(membershipRoles).values(roles.map((role) => ({ membershipId: membership.id, role })));
  return membership;
}

async function makeArtifact(overrides: {
  name: string;
  userId: string;
  groupId?: string;
  permissionManagerMode?: 'owner' | 'group_admin';
  permissions?: { groupId: string; access: Exclude<AccessLevel, 'none'> }[];
  userPermissions?: { userId: string; access: Exclude<AccessLevel, 'none'> }[];
}) {
  const [artifact] = await db
    .insert(artifacts)
    .values({
      name: overrides.name,
      type: 'configged-chat',
      userId: overrides.userId,
      groupId: overrides.groupId ?? null,
      permissionManagerMode: overrides.permissionManagerMode ?? 'owner',
    })
    .returning();
  const permissions = overrides.permissions ?? [];
  const userPermissions = overrides.userPermissions ?? [];
  if (permissions.length) await db.insert(artifactGroupPermissions).values(permissions.map((p) => ({ artifactId: artifact.id, groupId: p.groupId, access: p.access })));
  if (userPermissions.length) await db.insert(artifactUserPermissions).values(userPermissions.map((p) => ({ artifactId: artifact.id, userId: p.userId, access: p.access })));
  return artifact;
}

beforeEach(async () => {
  await db.execute(sql`TRUNCATE TABLE users, sso_providers, groups, memberships, membership_roles, artifacts, artifact_group_permissions, artifact_user_permissions, channels RESTART IDENTITY CASCADE`);

  const ownerRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'owner@example.com', password: 'password123', confirmPassword: 'password123' });
  ownerToken = ownerRes.body.token;
  ownerUserId = ownerRes.body.user._id;

  const otherRes = await request(app)
    .post('/api/auth/register')
    .send({ email: 'other@example.com', password: 'password123', confirmPassword: 'password123' });
  otherToken = otherRes.body.token;
  otherUserId = otherRes.body.user._id;
});

// ─── GET /api/documents/:id — access control ──────────────────────────────────

describe('GET /api/documents/:id', () => {
  it('owner can fetch the document', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it('user with read user-ACL entry can fetch the document', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId, userPermissions: [{ userId: otherUserId, access: 'read' }] });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
  });

  it('user with group read access can fetch the document', async () => {
    const g = await makeGroup({ name: 'G' });
    await makeMembership(otherUserId, g.id, ['member']);
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId, permissions: [{ groupId: g.id, access: 'read' }] });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
  });

  it('user with no permissions gets 403', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request gets 401', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app).get(`/api/documents/${doc.id}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/documents — filtering ──────────────────────────────────────────

describe('GET /api/documents — filtering', () => {
  it('returns owned documents', async () => {
    await makeArtifact({ name: 'Mine', userId: ownerUserId });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'Mine')).toBe(true);
  });

  it('returns documents where user has a user-ACL entry', async () => {
    await makeArtifact({ name: 'Shared', userId: ownerUserId, userPermissions: [{ userId: otherUserId, access: 'read' }] });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'Shared')).toBe(true);
  });

  it('returns documents where user has group access', async () => {
    const g = await makeGroup({ name: 'G' });
    await makeMembership(otherUserId, g.id, ['member']);
    await makeArtifact({ name: 'GroupDoc', userId: ownerUserId, permissions: [{ groupId: g.id, access: 'read' }] });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'GroupDoc')).toBe(true);
  });

  it('does not return documents where user has no access', async () => {
    await makeArtifact({ name: 'Private', userId: ownerUserId });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'Private')).toBe(false);
  });
});

// ─── POST /api/documents — group admin flow ───────────────────────────────────

describe('POST /api/documents — group admin flow', () => {
  it('group admin can create a document for a target user', async () => {
    const g = await makeGroup({ name: 'G' });
    await makeMembership(ownerUserId, g.id, ['admin']);

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ForOther', workflowType: 'configged-chat', groupId: g.id, targetUserId: otherUserId });

    expect(res.status).toBe(201);
    expect(res.body.permissionManagerMode).toBe('group_admin');
    expect(res.body.userPermissions.some((p: { userId: string; access: string }) => p.userId === otherUserId && p.access === 'write')).toBe(true);
    expect(res.body.permissions.some((p: { access: string }) => p.access === 'admin')).toBe(true);
  });

  it('ancestor group gets read access when creating in a child group', async () => {
    const parent = await makeGroup({ name: 'Parent' });
    const child = await makeGroup({ name: 'Child', parentGroupId: parent.id, ancestors: [parent.id] });
    await makeMembership(ownerUserId, child.id, ['admin']);

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', workflowType: 'configged-chat', groupId: child.id, targetUserId: otherUserId });

    expect(res.status).toBe(201);
    const parentPerm = res.body.permissions.find((p: { access: string }) => p.access === 'read');
    expect(parentPerm).toBeDefined();
  });

  it('non-member cannot create document for another user', async () => {
    const g = await makeGroup({ name: 'G' });
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', workflowType: 'configged-chat', groupId: g.id, targetUserId: otherUserId });
    expect(res.status).toBe(403);
  });

  it('group member (not admin) cannot create document for another user', async () => {
    const g = await makeGroup({ name: 'G' });
    await makeMembership(ownerUserId, g.id, ['member']);
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', workflowType: 'configged-chat', groupId: g.id, targetUserId: otherUserId });
    expect(res.status).toBe(403);
  });

  it('returns 400 when targetUserId is provided without groupId', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', workflowType: 'configged-chat', targetUserId: otherUserId });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/documents — parentId ───────────────────────────────────────────

describe('POST /api/documents — parentId', () => {
  it('creates document with a valid parentId', async () => {
    const parent = await makeArtifact({ name: 'Parent', userId: ownerUserId });

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Child', workflowType: 'configged-chat', parentId: parent.id });

    expect(res.status).toBe(201);
    expect(res.body.parentId).toBe(parent.id);
  });

  it('returns 400 when parentId does not reference an existing artifact', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Child', workflowType: 'configged-chat', parentId: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/documents/:id/user-permissions ────────────────────────────────

describe('PATCH /api/documents/:id/user-permissions', () => {
  it('owner can grant read to another user', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'read' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { userId: string; access: string }) => p.userId === otherUserId && p.access === 'read')).toBe(true);
  });

  it('owner can grant write', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { access: string }) => p.access === 'write')).toBe(true);
  });

  it('owner can grant admin', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { access: string }) => p.access === 'admin')).toBe(true);
  });

  it('granting to the same user twice upserts (no duplicate entry)', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'read' });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'write' });
    expect(res.status).toBe(200);
    const perms = res.body.userPermissions.filter((p: { userId: string }) => p.userId === otherUserId);
    expect(perms).toHaveLength(1);
    expect(perms[0].access).toBe('write');
  });

  it('user without manage rights gets 403', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: ownerUserId, access: 'read' });
    expect(res.status).toBe(403);
  });

  it('cannot grant access level higher than own — 403', async () => {
    // otherUser is a group admin (can manage permissions) but the group only has 'write' access on
    // the doc, so otherUser's computed access level is 'write', not 'admin'
    const g = await makeGroup({ name: 'G' });
    await makeMembership(otherUserId, g.id, ['admin']);
    const doc = await makeArtifact({
      name: 'Doc',
      userId: ownerUserId,
      groupId: g.id,
      permissionManagerMode: 'group_admin',
      permissions: [{ groupId: g.id, access: 'write' }],
    });
    const thirdRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'third@example.com', password: 'password123', confirmPassword: 'password123' });
    const thirdId = thirdRes.body.user._id;

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: thirdId, access: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Cannot grant access level higher than your own/);
  });

  it('returns 400 for an invalid access value', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'superadmin' });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/documents/:id/user-permissions/:userId ───────────────────────

describe('DELETE /api/documents/:id/user-permissions/:userId', () => {
  it('owner can remove a user permission', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId, userPermissions: [{ userId: otherUserId, access: 'read' }] });
    const res = await request(app)
      .delete(`/api/documents/${doc.id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);
  });

  it('user without manage rights gets 403', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId, userPermissions: [{ userId: otherUserId, access: 'read' }] });
    const res = await request(app)
      .delete(`/api/documents/${doc.id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('removing a non-existent userId returns 404', async () => {
    const doc = await makeArtifact({ name: 'Doc', userId: ownerUserId });
    const res = await request(app)
      .delete(`/api/documents/${doc.id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
