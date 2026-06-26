import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { ArtifactModel } from '../models/document.model';
import { Group } from '../models/group.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { getEffectiveGroupIds, getUserAccessLevel } from '../services/permission.service';
import type { CreateDocumentRequest } from '@agentic-client-server-base/shared-types';

export async function listDocuments(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const effectiveGroupIds = await getEffectiveGroupIds(req.userId!);
    const docs = await ArtifactModel.find({
      type: 'configged-chat',
      'permissions.groupId': { $in: effectiveGroupIds },
    }).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

export async function createDocument(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name, groupId } = req.body as Partial<CreateDocumentRequest>;
    if (!name?.trim()) {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (!groupId) {
      res.status(400).json({ message: 'groupId is required' });
      return;
    }

    const owningGroup = await Group.findById(groupId, { ancestors: 1 });
    if (!owningGroup) {
      res.status(400).json({ message: 'group not found' });
      return;
    }

    const permissions = [
      { groupId: new Types.ObjectId(groupId), access: 'admin' as const },
      ...owningGroup.ancestors.map((ancId) => ({
        groupId: ancId as Types.ObjectId,
        access: 'read' as const,
      })),
    ];

    const doc = await ArtifactModel.create({
      name: name.trim(),
      type: 'configged-chat',
      userId: req.userId,
      groupId: new Types.ObjectId(groupId),
      permissions,
    });
    res.status(201).json(doc);
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
    const doc = await ArtifactModel.findById(req.params['id']);
    if (!doc) {
      res.status(404).json({ message: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
}
