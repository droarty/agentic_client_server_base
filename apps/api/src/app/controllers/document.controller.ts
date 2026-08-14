import { Response, NextFunction } from 'express';
import { eq, and, or, inArray, desc } from 'drizzle-orm';
import {
  artifacts,
  channels,
  groups,
  memberships,
  membershipRoles,
  artifactGroupPermissions,
  artifactUserPermissions,
} from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getEffectiveGroupIds,
  getUserAccessLevel,
  computeAccessLevel,
  canManagePermissions,
  getArtifactAccessDoc,
  AccessLevel,
} from '../services/permission.service';
import type { CreateDocumentRequest, SetUserPermissionRequest } from '@agentic-client-server-base/shared-types';

type ArtifactRow = typeof artifacts.$inferSelect;

function toArtifactSummaryDto(artifact: ArtifactRow, currentChannelId: string) {
  return {
    _id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    userId: artifact.userId,
    groupId: artifact.groupId ?? undefined,
    parentId: artifact.parentId ?? undefined,
    currentChannelId,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

async function hydrateArtifact(artifact: ArtifactRow, currentChannelId: string) {
  const db = getDb();
  const [groupPerms, userPerms] = await Promise.all([
    db.select().from(artifactGroupPermissions).where(eq(artifactGroupPermissions.artifactId, artifact.id)),
    db.select().from(artifactUserPermissions).where(eq(artifactUserPermissions.artifactId, artifact.id)),
  ]);
  return {
    _id: artifact.id,
    name: artifact.name,
    type: artifact.type,
    groupId: artifact.groupId ?? undefined,
    parentId: artifact.parentId ?? undefined,
    currentChannelId,
    permissions: groupPerms.map((p) => ({ groupId: p.groupId, access: p.access })),
    userPermissions: userPerms.map((p) => ({ userId: p.userId, access: p.access })),
    permissionManagerMode: artifact.permissionManagerMode,
    state: artifact.state ?? undefined,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

async function getChannelMapForArtifacts(artifactIds: string[]): Promise<Map<string, string>> {
  if (artifactIds.length === 0) return new Map();
  const db = getDb();
  const rows = await db.select({ artifactId: channels.artifactId, channelId: channels.channelId }).from(channels).where(inArray(channels.artifactId, artifactIds));
  return new Map(rows.filter((r) => r.artifactId != null).map((r) => [r.artifactId as string, r.channelId]));
}

async function getChannelIdForArtifact(artifactId: string): Promise<string> {
  const db = getDb();
  const [channel] = await db.select({ channelId: channels.channelId }).from(channels).where(eq(channels.artifactId, artifactId));
  return channel?.channelId ?? '';
}

export async function listDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.userId!;
    const db = getDb();
    const effectiveGroupIds = await getEffectiveGroupIds(userId);

    const userPermRows = await db.select({ artifactId: artifactUserPermissions.artifactId }).from(artifactUserPermissions).where(eq(artifactUserPermissions.userId, userId));
    const groupPermRows = effectiveGroupIds.length > 0
      ? await db.select({ artifactId: artifactGroupPermissions.artifactId }).from(artifactGroupPermissions).where(inArray(artifactGroupPermissions.groupId, effectiveGroupIds))
      : [];
    const permittedIds = [...new Set([...userPermRows.map((r) => r.artifactId), ...groupPermRows.map((r) => r.artifactId)])];

    const whereClause = permittedIds.length > 0 ? or(eq(artifacts.userId, userId), inArray(artifacts.id, permittedIds))! : eq(artifacts.userId, userId);
    const docs = await db.select().from(artifacts).where(whereClause).orderBy(desc(artifacts.createdAt));
    const channelMap = await getChannelMapForArtifacts(docs.map((d) => d.id));
    res.json(docs.map((d) => toArtifactSummaryDto(d, channelMap.get(d.id) ?? '')));
  } catch (err) {
    next(err);
  }
}

export async function createDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const { name, workflowType, groupId, targetUserId, parentId } = req.body as Partial<CreateDocumentRequest>;
    if (!name?.trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (!workflowType?.trim()) {
      res.status(400).json({ message: 'workflowType is required' });
      return;
    }

    let permissions: { groupId: string; access: 'admin' | 'read' }[] = [];
    let resolvedGroupId: string | undefined;

    if (groupId) {
      const [owningGroup] = await db.select({ id: groups.id, ancestors: groups.ancestors }).from(groups).where(eq(groups.id, groupId));
      if (!owningGroup) {
        res.status(400).json({ message: 'group not found' });
        return;
      }
      resolvedGroupId = owningGroup.id;
      permissions = [
        { groupId: resolvedGroupId, access: 'admin' },
        ...owningGroup.ancestors.map((ancId) => ({ groupId: ancId, access: 'read' as const })),
      ];
    }

    let resolvedParentId: string | undefined;
    if (parentId) {
      const [parentArtifact] = await db.select({ id: artifacts.id }).from(artifacts).where(eq(artifacts.id, parentId));
      if (!parentArtifact) {
        res.status(400).json({ message: 'parent artifact not found' });
        return;
      }
      resolvedParentId = parentArtifact.id;
    }

    // Flow 2: group admin creates an artifact for a target user
    if (targetUserId) {
      if (!groupId) {
        res.status(400).json({ message: 'groupId is required when targetUserId is provided' });
        return;
      }
      const allowed = await isGroupAdmin(resolvedGroupId!, req.userId!);
      if (!allowed) {
        res.status(403).json({ message: 'Only group admins can create artifacts for other users' });
        return;
      }

      const { artifact, channelId } = await db.transaction(async (tx) => {
        const [newArtifact] = await tx
          .insert(artifacts)
          .values({
            name: name.trim(),
            type: workflowType.trim(),
            userId: targetUserId,
            groupId: resolvedGroupId,
            parentId: resolvedParentId,
            permissionManagerMode: 'group_admin',
          })
          .returning();
        if (permissions.length > 0) {
          await tx.insert(artifactGroupPermissions).values(permissions.map((p) => ({ artifactId: newArtifact.id, groupId: p.groupId, access: p.access })));
        }
        await tx.insert(artifactUserPermissions).values({ artifactId: newArtifact.id, userId: targetUserId, access: 'write' });
        const [channel] = await tx.insert(channels).values({ workflowType: workflowType.trim(), userId: targetUserId, artifactId: newArtifact.id, groupId: resolvedGroupId }).returning();
        return { artifact: newArtifact, channelId: channel.channelId };
      });
      res.status(201).json(await hydrateArtifact(artifact, channelId));
      return;
    }

    // Flow 1: user creates their own artifact
    const { artifact, channelId } = await db.transaction(async (tx) => {
      const [newArtifact] = await tx
        .insert(artifacts)
        .values({
          name: name.trim(),
          type: workflowType.trim(),
          userId: req.userId!,
          groupId: resolvedGroupId,
          parentId: resolvedParentId,
          permissionManagerMode: 'owner',
        })
        .returning();
      if (permissions.length > 0) {
        await tx.insert(artifactGroupPermissions).values(permissions.map((p) => ({ artifactId: newArtifact.id, groupId: p.groupId, access: p.access })));
      }
      const [channel] = await tx.insert(channels).values({ workflowType: workflowType.trim(), userId: req.userId!, artifactId: newArtifact.id, groupId: resolvedGroupId }).returning();
      return { artifact: newArtifact, channelId: channel.channelId };
    });
    res.status(201).json(await hydrateArtifact(artifact, channelId));
  } catch (err) {
    next(err);
  }
}

async function isGroupAdmin(groupId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [membership] = await db.select().from(memberships).where(and(eq(memberships.groupId, groupId), eq(memberships.userId, userId)));
  if (!membership) return false;
  const roleRows = await db
    .select()
    .from(membershipRoles)
    .where(and(eq(membershipRoles.membershipId, membership.id), inArray(membershipRoles.role, ['admin', 'owner'])));
  return roleRows.length > 0;
}

export async function getDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const access = await getUserAccessLevel(req.userId!, req.params['id']);
    if (access === 'none') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    const db = getDb();
    const [doc] = await db.select().from(artifacts).where(eq(artifacts.id, req.params['id']));
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    const currentChannelId = await getChannelIdForArtifact(doc.id);
    res.json(await hydrateArtifact(doc, currentChannelId));
  } catch (err) {
    next(err);
  }
}

export async function setUserPermission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const [doc] = await db.select().from(artifacts).where(eq(artifacts.id, req.params['id']));
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const accessDoc = await getArtifactAccessDoc(doc.id);
    const allowed = accessDoc && (await canManagePermissions(req.userId!, accessDoc));
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const { userId, access } = req.body as Partial<SetUserPermissionRequest>;
    if (!userId || !access) {
      res.status(400).json({ message: 'userId and access are required' });
      return;
    }
    if (!['read', 'write', 'admin'].includes(access)) {
      res.status(400).json({ message: 'access must be read, write, or admin' });
      return;
    }

    // Requester cannot grant more than their own access level
    const callerLevel: AccessLevel = await computeAccessLevel(req.userId!, accessDoc!);
    const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };
    if (ACCESS_RANK[access] > ACCESS_RANK[callerLevel]) {
      res.status(403).json({ message: 'Cannot grant access level higher than your own' });
      return;
    }

    await db
      .insert(artifactUserPermissions)
      .values({ artifactId: doc.id, userId, access })
      .onConflictDoUpdate({ target: [artifactUserPermissions.artifactId, artifactUserPermissions.userId], set: { access } });

    const currentChannelId = await getChannelIdForArtifact(doc.id);
    res.json(await hydrateArtifact(doc, currentChannelId));
  } catch (err) {
    next(err);
  }
}

export async function removeUserPermission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const [doc] = await db.select().from(artifacts).where(eq(artifacts.id, req.params['id']));
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const accessDoc = await getArtifactAccessDoc(doc.id);
    const allowed = accessDoc && (await canManagePermissions(req.userId!, accessDoc));
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const targetUserId = req.params['userId'];
    const deleted = await db
      .delete(artifactUserPermissions)
      .where(and(eq(artifactUserPermissions.artifactId, doc.id), eq(artifactUserPermissions.userId, targetUserId)))
      .returning({ userId: artifactUserPermissions.userId });
    if (deleted.length === 0) {
      res.status(404).json({ message: 'Permission not found' });
      return;
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
