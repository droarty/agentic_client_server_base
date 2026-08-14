import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as path from 'path';
import type { Pool } from 'pg';
import {
  createDb,
  type Database,
  users,
  groups,
  memberships,
  membershipRoles,
  artifacts,
  artifactGroupPermissions,
  artifactUserPermissions,
} from '@agentic-client-server-base/db-schema';
import type { AccessLevel } from '@agentic-client-server-base/access-control';
import { startTestPostgres, type TestPostgresHandle } from '@agentic-client-server-base/db-schema/test-helpers';
import { connectDB, disconnectDB } from '../db/connect';
import type { GroupRole } from '@agentic-client-server-base/shared-types';
import { getEffectiveGroupIds, computeAccessLevel, canManagePermissions, type ArtifactAccessDoc } from './permission.service';

let pgHandle: TestPostgresHandle;
let db: Database;
let pool: Pool;

beforeAll(async () => {
  pgHandle = await startTestPostgres('permission_service_test');
  const created = createDb(pgHandle.connectionString);
  db = created.db;
  pool = created.pool;
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../../../../libs/db-schema/drizzle') });
  await connectDB(pgHandle.connectionString);
}, 60000);

afterAll(async () => {
  await disconnectDB();
  await pool?.end();
  await pgHandle?.stop();
}, 30000);

afterEach(async () => {
  await db.execute(sql`TRUNCATE TABLE users, groups, memberships, membership_roles, artifacts, artifact_group_permissions, artifact_user_permissions RESTART IDENTITY CASCADE`);
});

async function makeUser(): Promise<string> {
  const [user] = await db.insert(users).values({ email: `${Math.random()}@test.com` }).returning();
  return user.id;
}

async function makeGroup(name: string, parentId?: string) {
  let ancestors: string[] = [];
  if (parentId) {
    const [p] = await db.select().from(groups).where(sql`${groups.id} = ${parentId}`);
    ancestors = [...(p?.ancestors ?? []), parentId];
  }
  const [group] = await db.insert(groups).values({ name, parentGroupId: parentId ?? null, ancestors }).returning();
  return group;
}

async function makeMembership(userId: string, groupId: string, roles: GroupRole[]) {
  const [membership] = await db.insert(memberships).values({ userId, groupId }).returning();
  if (roles.length) await db.insert(membershipRoles).values(roles.map((role) => ({ membershipId: membership.id, role })));
  return membership;
}

async function makeArtifact(overrides: {
  userId?: string;
  groupId?: string | null;
  permissionManagerMode?: 'owner' | 'group_admin';
  permissions?: { groupId: string; access: Exclude<AccessLevel, 'none'> }[];
  userPermissions?: { userId: string; access: Exclude<AccessLevel, 'none'> }[];
} = {}): Promise<ArtifactAccessDoc> {
  const ownerUserId = overrides.userId ?? (await makeUser());
  const [artifact] = await db
    .insert(artifacts)
    .values({
      name: 'test',
      type: 'configged-chat',
      userId: ownerUserId,
      groupId: overrides.groupId ?? null,
      permissionManagerMode: overrides.permissionManagerMode ?? 'owner',
    })
    .returning();

  const permissions = overrides.permissions ?? [];
  const userPermissions = overrides.userPermissions ?? [];
  if (permissions.length) {
    await db.insert(artifactGroupPermissions).values(permissions.map((p) => ({ artifactId: artifact.id, groupId: p.groupId, access: p.access })));
  }
  if (userPermissions.length) {
    await db.insert(artifactUserPermissions).values(userPermissions.map((p) => ({ artifactId: artifact.id, userId: p.userId, access: p.access })));
  }

  return {
    id: artifact.id,
    userId: artifact.userId,
    groupId: artifact.groupId,
    permissionManagerMode: artifact.permissionManagerMode,
    permissions,
    userPermissions,
  };
}

// ─── getEffectiveGroupIds ─────────────────────────────────────────────────────

describe('getEffectiveGroupIds', () => {
  test('returns [] when user has no memberships', async () => {
    const ids = await getEffectiveGroupIds(await makeUser());
    expect(ids).toHaveLength(0);
  });

  test('returns the direct group when user is in one group with no ancestors', async () => {
    const g = await makeGroup('A');
    const u = await makeUser();
    await makeMembership(u, g.id, ['member']);
    const ids = await getEffectiveGroupIds(u);
    expect(ids).toContain(g.id);
    expect(ids).toHaveLength(1);
  });

  test('includes parent when user is in a child group', async () => {
    const parent = await makeGroup('Parent');
    const child = await makeGroup('Child', parent.id);
    const u = await makeUser();
    await makeMembership(u, child.id, ['member']);
    const ids = await getEffectiveGroupIds(u);
    expect(ids).toContain(parent.id);
    expect(ids).toContain(child.id);
  });

  test('includes all ancestors for a deep chain', async () => {
    const a = await makeGroup('A');
    const b = await makeGroup('B', a.id);
    const c = await makeGroup('C', b.id);
    const u = await makeUser();
    await makeMembership(u, c.id, ['member']);
    const ids = await getEffectiveGroupIds(u);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    expect(ids).toContain(c.id);
  });

  test('includes all groups from two disjoint memberships', async () => {
    const g1 = await makeGroup('G1');
    const g2 = await makeGroup('G2');
    const u = await makeUser();
    await makeMembership(u, g1.id, ['member']);
    await makeMembership(u, g2.id, ['member']);
    const ids = await getEffectiveGroupIds(u);
    expect(ids).toContain(g1.id);
    expect(ids).toContain(g2.id);
  });
});

// ─── computeAccessLevel — owner mode ─────────────────────────────────────────

describe('computeAccessLevel — owner mode', () => {
  test('document owner gets admin', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: u });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });

  test('non-owner with no permissions gets none', async () => {
    const doc = await makeArtifact({ userId: await makeUser() });
    expect(await computeAccessLevel(await makeUser(), doc)).toBe('none');
  });

  test('user with read ACL entry gets read', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: await makeUser(), userPermissions: [{ userId: u, access: 'read' }] });
    expect(await computeAccessLevel(u, doc)).toBe('read');
  });

  test('user with write ACL entry gets write', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: await makeUser(), userPermissions: [{ userId: u, access: 'write' }] });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user with admin ACL entry gets admin', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: await makeUser(), userPermissions: [{ userId: u, access: 'admin' }] });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });

  test('user in group with read permission gets read', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['member']);
    const doc = await makeArtifact({ userId: await makeUser(), permissions: [{ groupId: g.id, access: 'read' }] });
    expect(await computeAccessLevel(u, doc)).toBe('read');
  });

  test('user ACL read and group write — write wins (max)', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['member']);
    const doc = await makeArtifact({
      userId: await makeUser(),
      userPermissions: [{ userId: u, access: 'read' }],
      permissions: [{ groupId: g.id, access: 'write' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user ACL write and group read — write wins (max)', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['member']);
    const doc = await makeArtifact({
      userId: await makeUser(),
      userPermissions: [{ userId: u, access: 'write' }],
      permissions: [{ groupId: g.id, access: 'read' }],
    });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('parent group permission is inherited by child group member', async () => {
    const parent = await makeGroup('Parent');
    const child = await makeGroup('Child', parent.id);
    const u = await makeUser();
    await makeMembership(u, child.id, ['member']);
    const doc = await makeArtifact({ userId: await makeUser(), permissions: [{ groupId: parent.id, access: 'write' }] });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });
});

// ─── computeAccessLevel — group_admin mode ────────────────────────────────────

describe('computeAccessLevel — group_admin mode', () => {
  test('document owner is not auto-admin in group_admin mode', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: u, permissionManagerMode: 'group_admin' });
    expect(await computeAccessLevel(u, doc)).toBe('none');
  });

  test('owner with write user ACL gets write in group_admin mode', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: u, permissionManagerMode: 'group_admin', userPermissions: [{ userId: u, access: 'write' }] });
    expect(await computeAccessLevel(u, doc)).toBe('write');
  });

  test('user in group with admin permission gets admin in group_admin mode', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['admin']);
    const doc = await makeArtifact({ userId: await makeUser(), permissionManagerMode: 'group_admin', permissions: [{ groupId: g.id, access: 'admin' }] });
    expect(await computeAccessLevel(u, doc)).toBe('admin');
  });
});

// ─── canManagePermissions — owner mode ────────────────────────────────────────

describe('canManagePermissions — owner mode', () => {
  test('document owner can manage', async () => {
    const u = await makeUser();
    const doc = await makeArtifact({ userId: u });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('non-owner with no groupId cannot manage', async () => {
    const doc = await makeArtifact({ userId: await makeUser() });
    expect(await canManagePermissions(await makeUser(), doc)).toBe(false);
  });

  test('user in doc group with member role cannot manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['member']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('user in doc group with admin role can manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['admin']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('user in doc group with owner role can manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['owner']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });
});

// ─── canManagePermissions — group_admin mode ──────────────────────────────────

describe('canManagePermissions — group_admin mode', () => {
  test('group admin can manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['admin']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('group owner can manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['owner']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(true);
  });

  test('group member cannot manage', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    await makeMembership(u, g.id, ['member']);
    const doc = await makeArtifact({ userId: await makeUser(), groupId: g.id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('document owner not in group cannot manage in group_admin mode', async () => {
    const u = await makeUser();
    const g = await makeGroup('G');
    const doc = await makeArtifact({ userId: u, groupId: g.id, permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(u, doc)).toBe(false);
  });

  test('returns false when groupId is null', async () => {
    const doc = await makeArtifact({ userId: await makeUser(), permissionManagerMode: 'group_admin' });
    expect(await canManagePermissions(await makeUser(), doc)).toBe(false);
  });
});
