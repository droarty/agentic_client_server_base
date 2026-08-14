import { eq, and, inArray, desc } from 'drizzle-orm';
import { groups, memberships, membershipRoles, users } from '@agentic-client-server-base/db-schema';
import type { GroupRole } from '@agentic-client-server-base/shared-types';
import { getDb } from '../db/connect';

function notFound(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 404;
  return err;
}

function conflict(message: string): Error & { statusCode: number } {
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = 409;
  return err;
}

function toGroupDto(group: typeof groups.$inferSelect) {
  return {
    _id: group.id,
    name: group.name,
    parentGroupId: group.parentGroupId ?? undefined,
    ancestors: group.ancestors,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

async function getRolesForMembership(membershipId: string): Promise<GroupRole[]> {
  const db = getDb();
  const rows = await db.select({ role: membershipRoles.role }).from(membershipRoles).where(eq(membershipRoles.membershipId, membershipId));
  return rows.map((r) => r.role);
}

function toMembershipDto(membership: typeof memberships.$inferSelect, roles: GroupRole[]) {
  return {
    _id: membership.id,
    userId: membership.userId,
    groupId: membership.groupId,
    roles,
    joinedAt: membership.joinedAt,
  };
}

// group + owner membership creation wrapped in one transaction — the
// original Mongo version issued these as two unrelated calls with no
// atomicity, so a crash between them could leave a group with no owner.
export async function createGroup(name: string, creatorUserId: string, parentGroupId?: string) {
  const db = getDb();
  return db.transaction(async (tx) => {
    let ancestors: string[] = [];
    let resolvedParentId: string | undefined;

    if (parentGroupId) {
      const [parent] = await tx.select({ id: groups.id, ancestors: groups.ancestors }).from(groups).where(eq(groups.id, parentGroupId));
      if (!parent) throw notFound('Parent group not found');
      resolvedParentId = parent.id;
      ancestors = [...parent.ancestors, resolvedParentId];
    }

    const [group] = await tx.insert(groups).values({ name, parentGroupId: resolvedParentId ?? null, ancestors }).returning();
    const [membership] = await tx
      .insert(memberships)
      .values({ userId: creatorUserId, groupId: group.id })
      .returning();
    await tx.insert(membershipRoles).values({ membershipId: membership.id, role: 'owner' });

    return toGroupDto(group);
  });
}

export async function getGroupsForUser(userId: string) {
  const db = getDb();
  const userMemberships = await db.select({ groupId: memberships.groupId }).from(memberships).where(eq(memberships.userId, userId));
  if (userMemberships.length === 0) return [];
  const groupIds = userMemberships.map((m) => m.groupId);
  const rows = await db.select().from(groups).where(inArray(groups.id, groupIds)).orderBy(desc(groups.createdAt));
  return rows.map(toGroupDto);
}

export async function getSubgroups(parentGroupId: string) {
  const db = getDb();
  const rows = await db.select().from(groups).where(eq(groups.parentGroupId, parentGroupId)).orderBy(desc(groups.createdAt));
  return rows.map(toGroupDto);
}

export async function getGroupById(id: string) {
  const db = getDb();
  const [group] = await db.select().from(groups).where(eq(groups.id, id));
  return group ? toGroupDto(group) : null;
}

export async function getGroupBreadcrumb(id: string): Promise<{ _id: string; name: string }[]> {
  const db = getDb();
  const [group] = await db.select({ name: groups.name, ancestors: groups.ancestors }).from(groups).where(eq(groups.id, id));
  if (!group) throw notFound('Group not found');

  const ancestorGroups = group.ancestors.length
    ? await db.select({ id: groups.id, name: groups.name }).from(groups).where(inArray(groups.id, group.ancestors))
    : [];
  const ancestorsById = new Map(ancestorGroups.map((g) => [g.id, g]));
  const orderedAncestors = group.ancestors
    .map((ancId) => ancestorsById.get(ancId))
    .filter((g): g is { id: string; name: string } => g != null);

  return [...orderedAncestors.map((g) => ({ _id: g.id, name: g.name })), { _id: id, name: group.name }];
}

export async function getMembership(groupId: string, userId: string) {
  const db = getDb();
  const [membership] = await db.select().from(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  if (!membership) return null;
  const roles = await getRolesForMembership(membership.id);
  return toMembershipDto(membership, roles);
}

// Replaces Membership.find(...).populate('userId', '_id email') with a real JOIN.
export async function getMembers(groupId: string) {
  const db = getDb();
  const rows = await db
    .select({ membership: memberships, roleRow: membershipRoles, user: { _id: users.id, email: users.email } })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .leftJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id))
    .where(eq(memberships.groupId, groupId));

  const byMembershipId = new Map<string, { membership: typeof memberships.$inferSelect; user: { _id: string; email: string }; roles: GroupRole[] }>();
  for (const row of rows) {
    const existing = byMembershipId.get(row.membership.id);
    if (existing) {
      if (row.roleRow) existing.roles.push(row.roleRow.role);
    } else {
      byMembershipId.set(row.membership.id, { membership: row.membership, user: row.user, roles: row.roleRow ? [row.roleRow.role] : [] });
    }
  }

  return [...byMembershipId.values()].map(({ membership, user, roles }) => ({
    ...toMembershipDto(membership, roles),
    user,
  }));
}

export async function addMember(groupId: string, userId: string, roles: GroupRole[]) {
  const db = getDb();
  const existing = await getMembership(groupId, userId);
  if (existing) throw conflict('User is already a member');

  return db.transaction(async (tx) => {
    const [membership] = await tx.insert(memberships).values({ userId, groupId }).returning();
    await tx.insert(membershipRoles).values(roles.map((role) => ({ membershipId: membership.id, role })));
    return toMembershipDto(membership, roles);
  });
}

export async function updateMemberRoles(groupId: string, userId: string, roles: GroupRole[]) {
  const db = getDb();
  const [membership] = await db.select().from(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  if (!membership) throw notFound('Membership not found');

  return db.transaction(async (tx) => {
    await tx.delete(membershipRoles).where(eq(membershipRoles.membershipId, membership.id));
    await tx.insert(membershipRoles).values(roles.map((role) => ({ membershipId: membership.id, role })));
    return toMembershipDto(membership, roles);
  });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const db = getDb();
  // membership_roles rows cascade-delete via their FK to memberships.
  const deleted = await db
    .delete(memberships)
    .where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)))
    .returning({ id: memberships.id });
  if (deleted.length === 0) throw notFound('Membership not found');
}
