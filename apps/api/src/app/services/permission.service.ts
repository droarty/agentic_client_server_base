import { Types } from 'mongoose';
import { Group } from '../models/group.model';
import { Membership } from '../models/membership.model';
import { ArtifactModel, IArtifact } from '../models/document.model';
import { AccessLevel, ACCESS_RANK } from '../websocket/access-level';

export type { AccessLevel };

function maxAccess(a: AccessLevel, b: AccessLevel): AccessLevel {
  return ACCESS_RANK[a] >= ACCESS_RANK[b] ? a : b;
}

export async function getEffectiveGroupIds(userId: string): Promise<Types.ObjectId[]> {
  const memberships = await Membership.find(
    { userId: new Types.ObjectId(userId) },
    { groupId: 1 }
  );
  if (memberships.length === 0) return [];

  const directIds = memberships.map((m) => m.groupId as Types.ObjectId);
  const groups = await Group.find({ _id: { $in: directIds } }, { ancestors: 1 });

  const allIds = new Set<string>(directIds.map((id) => id.toString()));
  for (const g of groups) {
    for (const anc of g.ancestors) {
      allIds.add(anc.toString());
    }
  }

  return [...allIds].map((id) => new Types.ObjectId(id));
}

export async function getUserAccessLevel(userId: string, artifactId: string): Promise<AccessLevel> {
  const doc = await ArtifactModel.findById(artifactId, {
    userId: 1,
    permissions: 1,
    userPermissions: 1,
    permissionManagerMode: 1,
    groupId: 1,
  });
  if (!doc) return 'none';

  return computeAccessLevel(userId, doc);
}

export async function computeAccessLevel(userId: string, doc: IArtifact): Promise<AccessLevel> {
  // In 'owner' mode the document owner is always admin
  if (doc.permissionManagerMode !== 'group_admin' && doc.userId === userId) return 'admin';

  // Explicit user-level ACL
  const userPerm = doc.userPermissions.find((p) => p.userId === userId);
  const userLevel: AccessLevel = userPerm?.access ?? 'none';

  // Group-based permissions
  const effectiveIds = await getEffectiveGroupIds(userId);
  let groupLevel: AccessLevel = 'none';
  if (effectiveIds.length > 0) {
    const effectiveSet = new Set(effectiveIds.map((id) => id.toString()));
    for (const perm of doc.permissions) {
      if (effectiveSet.has((perm.groupId as Types.ObjectId).toString())) {
        groupLevel = maxAccess(groupLevel, perm.access);
      }
    }
  }

  return maxAccess(userLevel, groupLevel);
}

export async function canManagePermissions(userId: string, doc: IArtifact): Promise<boolean> {
  if (doc.permissionManagerMode === 'group_admin') {
    if (!doc.groupId) return false;
    const membership = await Membership.findOne({
      groupId: doc.groupId,
      userId: new Types.ObjectId(userId),
    });
    return !!membership && (membership.roles.includes('admin') || membership.roles.includes('owner'));
  }
  // 'owner' mode
  return doc.userId === userId;
}
