import { Response, NextFunction } from 'express';
import { eq, and, isNull, type SQL } from 'drizzle-orm';
import { channels } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { AuthRequest } from '../middleware/auth.middleware';

export async function getOrCreateWorkflowSession(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const { workflowType, groupId, parentChannelId, responseHandler, targetChannelId } = req.body as {
      workflowType?: string;
      groupId?: string;
      parentChannelId?: string;
      responseHandler?: string;
      targetChannelId?: string;
    };
    if (!workflowType?.trim()) {
      res.status(400).json({ message: 'workflowType is required' });
      return;
    }
    const trimmedType = workflowType.trim();
    const db = getDb();

    // targetChannelId is only filtered on when provided — matching the original
    // query, which omitted it entirely (not an IS NULL check) when absent.
    const conditions: SQL[] = [
      eq(channels.workflowType, trimmedType),
      eq(channels.userId, req.userId!),
      eq(channels.isSessionChannel, true),
      groupId ? eq(channels.groupId, groupId) : isNull(channels.groupId),
    ];
    if (targetChannelId) conditions.push(eq(channels.targetChannelId, targetChannelId));

    let [channel] = await db.select().from(channels).where(and(...conditions));
    if (!channel) {
      [channel] = await db
        .insert(channels)
        .values({
          workflowType: trimmedType,
          userId: req.userId!,
          groupId: groupId ?? null,
          targetChannelId: targetChannelId ?? null,
          parentChannelId: parentChannelId ?? null,
          responseHandler: responseHandler ?? null,
          isSessionChannel: true,
        })
        .returning();
    }
    res.json({ channelId: channel.channelId });
  } catch (err) {
    next(err);
  }
}
