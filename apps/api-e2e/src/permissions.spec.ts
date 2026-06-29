import 'dotenv/config';
import request from 'supertest';
import mongoose, { Types } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../api/src/app/app';
import { Application } from 'express';
import { Group } from '../../api/src/app/models/group.model';
import { Membership } from '../../api/src/app/models/membership.model';
import { ArtifactModel } from '../../api/src/app/models/document.model';

let app: Application;
let mongod: MongoMemoryServer;

let ownerToken: string;
let ownerUserId: string;
let otherToken: string;
let otherUserId: string;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['JWT_SECRET'] = 'test-secret';
  await mongoose.connect(mongod.getUri());
  app = createApp();
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const cols = mongoose.connection.collections;
  for (const k in cols) await cols[k].deleteMany({});

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
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .get(`/api/documents/${doc._id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
  });

  it('user with read user-ACL entry can fetch the document', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [],
      userPermissions: [{ userId: otherUserId, access: 'read' }],
    });
    const res = await request(app)
      .get(`/api/documents/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
  });

  it('user with group read access can fetch the document', async () => {
    const g = await Group.create({ name: 'G', ancestors: [] });
    await Membership.create({ userId: new Types.ObjectId(otherUserId), groupId: g._id, roles: ['member'], joinedAt: new Date() });
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner',
      permissions: [{ groupId: g._id, access: 'read' }],
      userPermissions: [],
    });
    const res = await request(app)
      .get(`/api/documents/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
  });

  it('user with no permissions gets 403', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .get(`/api/documents/${doc._id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('unauthenticated request gets 401', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app).get(`/api/documents/${doc._id}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/documents — filtering ──────────────────────────────────────────

describe('GET /api/documents — filtering', () => {
  it('returns owned documents', async () => {
    await ArtifactModel.create({
      name: 'Mine', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'Mine')).toBe(true);
  });

  it('returns documents where user has a user-ACL entry', async () => {
    await ArtifactModel.create({
      name: 'Shared', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [],
      userPermissions: [{ userId: otherUserId, access: 'read' }],
    });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'Shared')).toBe(true);
  });

  it('returns documents where user has group access', async () => {
    const g = await Group.create({ name: 'G', ancestors: [] });
    await Membership.create({ userId: new Types.ObjectId(otherUserId), groupId: g._id, roles: ['member'], joinedAt: new Date() });
    await ArtifactModel.create({
      name: 'GroupDoc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner',
      permissions: [{ groupId: g._id, access: 'read' }],
      userPermissions: [],
    });
    const res = await request(app)
      .get('/api/documents')
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((d: { name: string }) => d.name === 'GroupDoc')).toBe(true);
  });

  it('does not return documents where user has no access', async () => {
    await ArtifactModel.create({
      name: 'Private', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
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
    const g = await Group.create({ name: 'G', ancestors: [] });
    await Membership.create({ userId: new Types.ObjectId(ownerUserId), groupId: g._id, roles: ['admin'], joinedAt: new Date() });

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'ForOther', groupId: (g._id as Types.ObjectId).toString(), targetUserId: otherUserId });

    expect(res.status).toBe(201);
    expect(res.body.permissionManagerMode).toBe('group_admin');
    expect(res.body.userPermissions.some((p: { userId: string; access: string }) => p.userId === otherUserId && p.access === 'write')).toBe(true);
    expect(res.body.permissions.some((p: { access: string }) => p.access === 'admin')).toBe(true);
  });

  it('ancestor group gets read access when creating in a child group', async () => {
    const parent = await Group.create({ name: 'Parent', ancestors: [] });
    const child = await Group.create({ name: 'Child', parentGroupId: parent._id, ancestors: [parent._id] });
    await Membership.create({ userId: new Types.ObjectId(ownerUserId), groupId: child._id, roles: ['admin'], joinedAt: new Date() });

    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', groupId: (child._id as Types.ObjectId).toString(), targetUserId: otherUserId });

    expect(res.status).toBe(201);
    const parentPerm = res.body.permissions.find((p: { access: string }) => p.access === 'read');
    expect(parentPerm).toBeDefined();
  });

  it('non-member cannot create document for another user', async () => {
    const g = await Group.create({ name: 'G', ancestors: [] });
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', groupId: (g._id as Types.ObjectId).toString(), targetUserId: otherUserId });
    expect(res.status).toBe(403);
  });

  it('group member (not admin) cannot create document for another user', async () => {
    const g = await Group.create({ name: 'G', ancestors: [] });
    await Membership.create({ userId: new Types.ObjectId(ownerUserId), groupId: g._id, roles: ['member'], joinedAt: new Date() });
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', groupId: (g._id as Types.ObjectId).toString(), targetUserId: otherUserId });
    expect(res.status).toBe(403);
  });

  it('returns 400 when targetUserId is provided without groupId', async () => {
    const res = await request(app)
      .post('/api/documents')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: 'Doc', targetUserId: otherUserId });
    expect(res.status).toBe(400);
  });
});

// ─── PATCH /api/documents/:id/user-permissions ────────────────────────────────

describe('PATCH /api/documents/:id/user-permissions', () => {
  it('owner can grant read to another user', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'read' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { userId: string; access: string }) => p.userId === otherUserId && p.access === 'read')).toBe(true);
  });

  it('owner can grant write', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'write' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { access: string }) => p.access === 'write')).toBe(true);
  });

  it('owner can grant admin', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.userPermissions.some((p: { access: string }) => p.access === 'admin')).toBe(true);
  });

  it('granting to the same user twice upserts (no duplicate entry)', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'read' });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'write' });
    expect(res.status).toBe(200);
    const perms = res.body.userPermissions.filter((p: { userId: string }) => p.userId === otherUserId);
    expect(perms).toHaveLength(1);
    expect(perms[0].access).toBe('write');
  });

  it('user without manage rights gets 403', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: ownerUserId, access: 'read' });
    expect(res.status).toBe(403);
  });

  it('cannot grant access level higher than own — 403', async () => {
    // otherUser is a group admin (can manage permissions) but the group only has 'write' access on
    // the doc, so otherUser's computed access level is 'write', not 'admin'
    const g = await Group.create({ name: 'G', ancestors: [] });
    await Membership.create({ userId: new Types.ObjectId(otherUserId), groupId: g._id, roles: ['admin'], joinedAt: new Date() });
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      groupId: g._id, permissionManagerMode: 'group_admin',
      permissions: [{ groupId: g._id, access: 'write' }],
      userPermissions: [],
    });
    const thirdRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'third@example.com', password: 'password123', confirmPassword: 'password123' });
    const thirdId = thirdRes.body.user._id;

    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ userId: thirdId, access: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Cannot grant access level higher than your own/);
  });

  it('returns 400 for an invalid access value', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .patch(`/api/documents/${doc._id}/user-permissions`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: otherUserId, access: 'superadmin' });
    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/documents/:id/user-permissions/:userId ───────────────────────

describe('DELETE /api/documents/:id/user-permissions/:userId', () => {
  it('owner can remove a user permission', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [],
      userPermissions: [{ userId: otherUserId, access: 'read' }],
    });
    const res = await request(app)
      .delete(`/api/documents/${doc._id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(204);
  });

  it('user without manage rights gets 403', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [],
      userPermissions: [{ userId: otherUserId, access: 'read' }],
    });
    const res = await request(app)
      .delete(`/api/documents/${doc._id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(403);
  });

  it('removing a non-existent userId returns 404', async () => {
    const doc = await ArtifactModel.create({
      name: 'Doc', type: 'configged-chat', userId: ownerUserId,
      permissionManagerMode: 'owner', permissions: [], userPermissions: [],
    });
    const res = await request(app)
      .delete(`/api/documents/${doc._id}/user-permissions/${otherUserId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });
});
