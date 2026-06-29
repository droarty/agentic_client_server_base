import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { Types } from 'mongoose';
import { Group } from '../models/group.model';
import { Membership } from '../models/membership.model';
import { ArtifactModel } from '../models/document.model';
import { getEffectiveGroupIds, computeAccessLevel, canManagePermissions } from './permission.service';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 30000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  const cols = mongoose.connection.collections;
  for (const k in cols) await cols[k].deleteMany({});
});

function uid(): string {
  return new Types.ObjectId().toString();
}

async function makeGroup(name: string, parent?: Types.ObjectId) {
  let ancestors: Types.ObjectId[] = [];
  if (parent) {
    const p = await Group.findById(parent);
    ancestors = [...((p?.ancestors as Types.ObjectId[]) ?? []), parent];
  }
  return Group.create({ name, parentGroupId: parent ?? null, ancestors });
}

async function makeMembership(userId: string, groupId: Types.ObjectId, roles: string[]) {
  return Membership.create({ userId: new Types.ObjectId(userId), groupId, roles, joinedAt: new Date() });
}

async function makeArtifact(overrides: Record<string, unknown> = {}) {
  return ArtifactModel.create({
    name: 'test',
    type: 'configged-chat',
    permissionManagerMode: 'owner',
    permissions: [],
    userPermissions: [],
    ...overrides,
  });
}

// ─── getEffectiveGroupIds ─────────────────────────────────────────────────────

describe('getEffectiveGroupIds', () => {
  test('returns [] when user has no memberships', async () => {
    const ids = await getEffectiveGroupIds(uid());
    expect(ids).toHaveLength(0);
  });

  test('returns the direct group when user is in one group with no ancestors', async () => {
    const g = await makeGroup('A');
    const u = uid();
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const ids = await getEffectiveGroupIds(u);
    expect(ids.map((id) => id.toString())).toContain((g._id as Types.ObjectId).toString());
    expect(ids).toHaveLength(1);
  });

  test('includes parent when user is in a child group', async () => {
    const parent = await makeGroup('Parent');
    const child = await makeGroup('Child', parent._id as Types.ObjectId);
    const u = uid();
    await makeMembership(u, child._id as Types.ObjectId, ['member']);
    const ids = (await getEffectiveGroupIds(u)).map((id) => id.toString());
    expect(ids).toContain((parent._id as Types.ObjectId).toString());
    expect(ids).toContain((child._id as Types.ObjectId).toString());
  });

  test('includes all ancestors for a deep chain', async () => {
    const a = await makeGroup('A');
    const b = await makeGroup('B', a._id as Types.ObjectId);
    const c = await makeGroup('C', b._id as Types.ObjectId);
    const u = uid();
    await makeMembership(u, c._id as Types.ObjectId, ['member']);
    const ids = (await getEffectiveGroupIds(u)).map((id) => id.toString());
    expect(ids).toContain((a._id as Types.ObjectId).toString());
    expect(ids).toContain((b._id as Types.ObjectId).toString());
    expect(ids).toContain((c._id as Types.ObjectId).toString());
  });

  test('includes all groups from two disjoint memberships', async () => {
    const g1 = await makeGroup('G1');
    const g2 = await makeGroup('G2');
    const u = uid();
    await makeMembership(u, g1._id as Types.ObjectId, ['member']);
    await makeMembership(u, g2._id as Types.ObjectId, ['member']);
    const ids = (await getEffectiveGroupIds(u)).map((id) => id.toString());
    expect(ids).toContain((g1._id as Types.ObjectId).toString());
    expect(ids).toContain((g2._id as Types.ObjectId).toString());
  });
});

// ─── computeAccessLevel — owner mode ─────────────────────────────────────────

describe('computeAccessLevel — owner mode', () => {
  test('document owner gets admin', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: u });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });

  test('non-owner with no permissions gets none', async () => {
    const doc = await makeArtifact({ userId: uid() });
    expect(await computeAccessLevel(uid(), doc)).toBe('none');
  });

  test('user with read ACL entry gets read', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: uid(), userPermissions: [{ userId: u, access: 'read' }] });
    expect(await computeAccessLevel(u, doc)).toBe('read');
  });

  test('user with write ACL entry gets write', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: uid(), userPermissions: [{ userId: u, access: 'write' }] });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user with admin ACL entry gets admin', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: uid(), userPermissions: [{ userId: u, access: 'admin' }] });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });

  test('user in group with read permission gets read', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({
      userId: uid(),
      permissions: [{ groupId: g._id, access: 'read' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('read');
  });

  test('user ACL read and group write — write wins (max)', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({
      userId: uid(),
      userPermissions: [{ userId: u, access: 'read' }],
      permissions: [{ groupId: g._id, access: 'write' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user ACL write and group read — write wins (max)', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({
      userId: uid(),
      userPermissions: [{ userId: u, access: 'write' }],
      permissions: [{ groupId: g._id, access: 'read' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('parent group permission is inherited by child group member', async () => {
    const parent = await makeGroup('Parent');
    const child = await makeGroup('Child', parent._id as Types.ObjectId);
    const u = uid();
    await makeMembership(u, child._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({
      userId: uid(),
      permissions: [{ groupId: parent._id, access: 'write' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });
});

// ─── computeAccessLevel — group_admin mode ────────────────────────────────────

describe('computeAccessLevel — group_admin mode', () => {
  test('document owner is not auto-admin in group_admin mode', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: u, permissionManagerMode: 'group_admin' });
    expect(await computeAccessLevel(u, doc)).toBe('none');
  });

  test('owner with write user ACL gets write in group_admin mode', async () => {
    const u = uid();
    const doc = await makeArtifact({
      userId: u,
      permissionManagerMode: 'group_admin',
      userPermissions: [{ userId: u, access: 'write' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user in group with admin permission gets admin in group_admin mode', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['admin']);
    const doc = await makeArtifact({
      userId: uid(),
      permissionManagerMode: 'group_admin',
      permissions: [{ groupId: g._id, access: 'admin' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });
});

// ─── canManagePermissions — owner mode ────────────────────────────────────────

describe('canManagePermissions — owner mode', () => {
  test('document owner can manage', async () => {
    const u = uid();
    const doc = await makeArtifact({ userId: u });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('non-owner with no groupId cannot manage', async () => {
    const doc = await makeArtifact({ userId: uid() });
    expect(await canManagePermissions(uid(), doc)).toBe(false);
  });

  test('user in doc group with member role cannot manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('user in doc group with admin role can manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['admin']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('user in doc group with owner role can manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['owner']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });
});

// ─── canManagePermissions — group_admin mode ──────────────────────────────────

describe('canManagePermissions — group_admin mode', () => {
  test('group admin can manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['admin']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('group owner can manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['owner']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('group member cannot manage', async () => {
    const u = uid();
    const g = await makeGroup('G');
    await makeMembership(u, g._id as Types.ObjectId, ['member']);
    const doc = await makeArtifact({ userId: uid(), groupId: g._id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('document owner not in group cannot manage in group_admin mode', async () => {
    const u = uid();
    const g = await makeGroup('G');
    const doc = await makeArtifact({ userId: u, groupId: g._id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('returns false when groupId is null', async () => {
    const doc = await makeArtifact({ userId: uid(), permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(uid(), doc)).toBe(false);
  });
});
