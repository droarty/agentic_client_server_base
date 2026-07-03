import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ArtifactModel } from '../models/document.model';
import { ChannelModel } from '../models/channel.model';
import { Group } from '../models/group.model';
import { Membership } from '../models/membership.model';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  getEffectiveGroupIds,
  getUserAccessLevel,
  computeAccessLevel,
  canManagePermissions,
  AccessLevel,
} from '../services/permission.service';
import type { CreateDocumentRequest, SetUserPermissionRequest } from '@agentic-client-server-base/shared-types';

export async function listDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const effectiveGroupIds = await getEffectiveGroupIds(req.userId!);
    const groupFilter = effectiveGroupIds.length > 0
      ? [{ 'permissions.groupId': { $in: effectiveGroupIds } }]
      : [];
    const docs = await ArtifactModel.find({
      $or: [
        { userId: req.userId },
        { 'userPermissions.userId': req.userId },
        ...groupFilter,
      ],
    }).sort({ createdAt: -1 }).lean();
    const channels = docs.length > 0
      ? await ChannelModel.find({ artifactId: { $in: docs.map((d) => d._id) } }, { artifactId: 1, channelId: 1 }).lean()
      : [];
    const channelMap = new Map(channels.map((c) => [String(c.artifactId), c.channelId]));
    res.json(docs.map((d) => ({ ...d, _id: String(d._id), currentChannelId: channelMap.get(String(d._id)) ?? '' })));
  } catch (err) {
    next(err);
  }
}

export async function createDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, workflowType, groupId, targetUserId } = req.body as Partial<CreateDocumentRequest>;
    if (!name?.trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (!workflowType?.trim()) {
      res.status(400).json({ message: 'workflowType is required' });
      return;
    }

    let permissions: { groupId: Types.ObjectId; access: 'admin' | 'read' }[] = [];
    let groupObjectId: Types.ObjectId | undefined;

    if (groupId) {
      const owningGroup = await Group.findById(groupId, { ancestors: 1 });
      if (!owningGroup) {
        res.status(400).json({ message: 'group not found' });
        return;
      }
      groupObjectId = new Types.ObjectId(groupId);
      permissions = [
        { groupId: groupObjectId, access: 'admin' },
        ...owningGroup.ancestors.map((ancId) => ({ groupId: ancId as Types.ObjectId, access: 'read' as const })),
      ];
    }

    // Flow 2: group admin creates an artifact for a target user
    if (targetUserId) {
      if (!groupId) {
        res.status(400).json({ message: 'groupId is required when targetUserId is provided' });
        return;
      }
      const callerMembership = await Membership.findOne({
        groupId: groupObjectId,
        userId: new Types.ObjectId(req.userId!),
      });
      if (!callerMembership || (!callerMembership.roles.includes('admin') && !callerMembership.roles.includes('owner'))) {
        res.status(403).json({ message: 'Only group admins can create artifacts for other users' });
        return;
      }

      const doc = await ArtifactModel.create({
        name: name.trim(),
        type: workflowType.trim(),
        userId: targetUserId,
        groupId: groupObjectId,
        permissions,
        userPermissions: [{ userId: targetUserId, access: 'write' }],
        permissionManagerMode: 'group_admin',
      });
      const channel = await ChannelModel.create({
        workflowType: workflowType.trim(),
        userId: targetUserId,
        artifactId: doc._id,
        groupId: groupObjectId,
      });
      res.status(201).json({ ...doc.toObject(), currentChannelId: channel.channelId });
      return;
    }

    // Flow 1: user creates their own artifact
    const doc = await ArtifactModel.create({
      name: name.trim(),
      type: workflowType.trim(),
      userId: req.userId,
      groupId: groupObjectId,
      permissions,
      permissionManagerMode: 'owner',
    });
    const channel = await ChannelModel.create({
      workflowType: workflowType.trim(),
      userId: req.userId,
      artifactId: doc._id,
      groupId: groupObjectId,
    });
    res.status(201).json({ ...doc.toObject(), currentChannelId: channel.channelId });
  } catch (err) {
    next(err);
  }
}

export async function getDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const access = await getUserAccessLevel(req.userId!, req.params['id']);
    if (access === 'none') {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }
    const doc = await ArtifactModel.findById(req.params['id']).lean();
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    const channel = await ChannelModel.findOne({ artifactId: doc._id }, { channelId: 1 }).lean();
    res.json({ ...doc, _id: String(doc._id), currentChannelId: channel?.channelId ?? '' });
  } catch (err) {
    next(err);
  }
}

export async function setUserPermission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await ArtifactModel.findById(req.params['id']);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const allowed = await canManagePermissions(req.userId!, doc);
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
    const callerLevel: AccessLevel = await computeAccessLevel(req.userId!, doc);
    const ACCESS_RANK: Record<AccessLevel, number> = { none: 0, read: 1, write: 2, admin: 3 };
    if (ACCESS_RANK[access] > ACCESS_RANK[callerLevel]) {
      res.status(403).json({ message: 'Cannot grant access level higher than your own' });
      return;
    }

    const existing = doc.userPermissions.findIndex((p) => p.userId === userId);
    if (existing >= 0) {
      doc.userPermissions[existing].access = access;
    } else {
      doc.userPermissions.push({ userId, access });
    }
    await doc.save();
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

export async function removeUserPermission(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const doc = await ArtifactModel.findById(req.params['id']);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }

    const allowed = await canManagePermissions(req.userId!, doc);
    if (!allowed) {
      res.status(403).json({ message: 'Forbidden' });
      return;
    }

    const targetUserId = req.params['userId'];
    const before = doc.userPermissions.length;
    doc.userPermissions = doc.userPermissions.filter((p) => p.userId !== targetUserId) as typeof doc.userPermissions;
    if (doc.userPermissions.length === before) {
      res.status(404).json({ message: 'Permission not found' });
      return;
    }

    await doc.save();
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
