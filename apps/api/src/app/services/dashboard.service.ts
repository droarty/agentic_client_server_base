import { eq, and, isNull } from 'drizzle-orm';
import { artifacts, channels } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';

// Consolidates the find-or-create-artifact-then-channel DB mechanics that
// used to be duplicated between UserEventManager's dashboard bootstrap and
// the group dashboard endpoint — that part was identical. Config-file
// reading (which differs subtly between call sites: one guards
// fs.existsSync, the other doesn't) stays at each call site; this only
// takes the already-resolved name/initialState. Wrapped in one transaction —
// the original Mongo version issued the artifact and channel creates as two
// unrelated calls with no atomicity.
export async function ensureDashboardChannel(params: {
  workflowType: string;
  userId: string;
  groupId?: string;
  artifactName: string;
  initialState?: Record<string, unknown>;
}): Promise<string> {
  const db = getDb();
  const { workflowType, userId, groupId, artifactName, initialState } = params;

  return db.transaction(async (tx) => {
    const artifactMatch = groupId
      ? and(eq(artifacts.type, workflowType), eq(artifacts.userId, userId), eq(artifacts.groupId, groupId))
      : and(eq(artifacts.type, workflowType), eq(artifacts.userId, userId), isNull(artifacts.groupId));

    let [artifact] = await tx.select().from(artifacts).where(artifactMatch);
    if (!artifact) {
      [artifact] = await tx
        .insert(artifacts)
        .values({
          name: artifactName,
          type: workflowType,
          userId,
          groupId: groupId ?? null,
          ...(initialState !== undefined ? { state: initialState } : {}),
        })
        .returning();
    }

    let [channel] = await tx.select().from(channels).where(eq(channels.artifactId, artifact.id));
    if (!channel) {
      [channel] = await tx
        .insert(channels)
        .values({ workflowType, userId, artifactId: artifact.id, groupId: artifact.groupId })
        .returning();
    }

    return channel.channelId;
  });
}
