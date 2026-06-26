import { Types } from 'mongoose';
import type { ArtifactAccess } from '@agentic-client-server-base/shared-types';
import { Group } from '../models/group.model';
import { Membership } from '../models/membership.model';
import { ArtifactModel } from '../models/document.model';

export type AccessLevel = 'none' | ArtifactAccess;

const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };

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
  const doc = await ArtifactModel.findById(artifactId, { userId: 1, permissions: 1 });
  if (!doc) return 'none';

  if (doc.userId === userId) return 'admin';

  const effectiveIds = await getEffectiveGroupIds(userId);
  if (effectiveIds.length === 0) return 'none';

  let best: AccessLevel = 'none';
  const effectiveSet = new Set(effectiveIds.map((id) => id.toString()));
  for (const perm of doc.permissions) {
    if (effectiveSet.has((perm.groupId as Types.ObjectId).toString())) {
      if (ACCESS_RANK[perm.access] > ACCESS_RANK[best]) best = perm.access;
    }
  }
  return best;
}
