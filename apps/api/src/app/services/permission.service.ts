import { eq, and, inArray } from 'drizzle-orm';
import {
  artifacts,
  artifactGroupPermissions,
  artifactUserPermissions,
  memberships,
  membershipRoles,
  groups,
} from '@agentic-client-server-base/db-schema';
import { AccessLevel, ACCESS_RANK } from '@agentic-client-server-base/access-control';
import { getDb } from '../db/connect';

export type { AccessLevel };

function maxAccess(a: AccessLevel, b: AccessLevel): AccessLevel {
  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

export interface ArtifactAccessDoc {
  id: string;
  userId: string;
  groupId: string | null;
  permissionManagerMode: 'owner' | 'group_admin';
  permissions: { groupId: string; access: AccessLevel }[];
  userPermissions: { userId: string; access: AccessLevel }[];
}

// Replaces reading the embedded permissions/userPermissions arrays directly
// off a Mongoose artifact document — those are now real join tables, so
// call sites that need the old "hydrated doc" shape fetch it through here.
export async function getArtifactAccessDoc(artifactId: string): Promise<ArtifactAccessDoc | null> {
  const db = getDb();
  const [artifact] = await db
    .select({
      id: artifacts.id,
      userId: artifacts.userId,
      groupId: artifacts.groupId,
      permissionManagerMode: artifacts.permissionManagerMode,
    })
    .from(artifacts)
    .where(eq(artifacts.id, artifactId));
  if (!artifact) return null;

  const [groupPerms, userPerms] = await Promise.all([
    db.select().from(artifactGroupPermissions).where(eq(artifactGroupPermissions.artifactId, artifactId)),
    db.select().from(artifactUserPermissions).where(eq(artifactUserPermissions.artifactId, artifactId)),
  ]);

  return {
    ...artifact,
    permissions: groupPerms.map((p) => ({ groupId: p.groupId, access: p.access })),
    userPermissions: userPerms.map((p) => ({ userId: p.userId, access: p.access })),
  };
}

export async function getEffectiveGroupIds(userId: string): Promise<string[]> {
  const db = getDb();
  const directMemberships = await db.select({ groupId: memberships.groupId }).from(memberships).where(eq(memberships.userId, userId));
  if (directMemberships.length === 0) return [];

  const directIds = directMemberships.map((m) => m.groupId);
  const groupRows = await db.select({ ancestors: groups.ancestors }).from(groups).where(inArray(groups.id, directIds));

  const allIds = new Set<string>(directIds);
  for (const g of groupRows) {
    for (const anc of g.ancestors) allIds.add(anc);
  }
  return [...allIds];
}

export async function getUserAccessLevel(userId: string, artifactId: string): Promise<AccessLevel> {
  const doc = await getArtifactAccessDoc(artifactId);
  if (!doc) return 'none';
  return computeAccessLevel(userId, doc);
}

export async function computeAccessLevel(userId: string, doc: ArtifactAccessDoc): Promise<AccessLevel> {
  // In 'owner' mode the document owner is always admin
  if (doc.permissionManagerMode !== 'group_admin' && doc.userId === userId) return 'admin';

  // Explicit user-level ACL
  const userPerm = doc.userPermissions.find((p) => p.userId === userId);
  const userLevel: AccessLevel = userPerm?.access ?? 'none';

  // Group-based permissions
  const effectiveIds = await getEffectiveGroupIds(userId);
  let groupLevel: AccessLevel = 'none';
  if (effectiveIds.length > 0) {
    const effectiveSet = new Set(effectiveIds);
    for (const perm of doc.permissions) {
      if (effectiveSet.has(perm.groupId)) {
        groupLevel = maxAccess(groupLevel, perm.access);
      }
    }
  }

  return maxAccess(userLevel, groupLevel);
}

async function membershipHasAnyRole(groupId: string, userId: string, roles: ('admin' | 'owner')[]): Promise<boolean> {
  const db = getDb();
  const [membership] = await db.select().from(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  if (!membership) return false;
  const roleRows = await db
    .select()
    .from(membershipRoles)
    .where(and(eq(membershipRoles.membershipId, membership.id), inArray(membershipRoles.role, roles)));
  return roleRows.length > 0;
}

export async function canManagePermissions(userId: string, doc: ArtifactAccessDoc): Promise<boolean> {
  if (doc.permissionManagerMode === 'group_admin') {
    if (!doc.groupId) return false;
    return membershipHasAnyRole(doc.groupId, userId, ['admin', 'owner']);
  }
  // 'owner' mode — document owner always allowed
  if (doc.userId === userId) return true;
  // If the document belongs to a group, its admins can also manage permissions
  if (doc.groupId) {
    return membershipHasAnyRole(doc.groupId, userId, ['admin', 'owner']);
  }
  return false;
}
