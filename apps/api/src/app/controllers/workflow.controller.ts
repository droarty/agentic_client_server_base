import { Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { ChannelModel } from '../models/channel.model';

export async function getOrCreateWorkflowSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workflowType, groupId, parentChannelId, responseHandler } = req.body as {
      workflowType?: string;
      groupId?: string;
      parentChannelId?: string;
      responseHandler?: string;
    };
    if (!workflowType?.trim()) {
      res.status(400).json({ message: 'workflowType is required' });
      return;
    }
    const query: Record<string, unknown> = {
      workflowType: workflowType.trim(),
      userId: req.userId,
    };
    if (groupId) query['groupId'] = new Types.ObjectId(groupId);

    let channel = await ChannelModel.findOne(query);
    if (!channel) {
      channel = await ChannelModel.create({
        workflowType: workflowType.trim(),
        userId: req.userId,
        groupId: groupId ? new Types.ObjectId(groupId) : undefined,
        parentChannelId: parentChannelId ?? undefined,
        responseHandler: responseHandler ?? undefined,
      });
    }
    res.json({ channelId: channel.channelId });
  } catch (err) {
    next(err);
  }
}
