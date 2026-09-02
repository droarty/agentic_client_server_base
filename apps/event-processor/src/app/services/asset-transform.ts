import { eq, sql } from 'drizzle-orm';
import { type Database, assets } from '@agentic-client-server-base/db-schema';
import { getValidAccessToken, planMediaDownload, downloadPickedMediaItem, PickedMediaItem } from './google-photos-picker.client';
import { storageClient, getStorageObjectUrl } from './r2-storage.client';

type AssetRow = typeof assets.$inferSelect;

// Turns a freshly-inserted (transformStatus: 'downloading') asset row into a
// browser-servable one: fetch the bytes from the source (re-deriving its own
// access token, since this runs independently of whatever request originally
// triggered it — see AssetTransformManager), optionally convert, upload to
// storage, and always leave the row in a terminal state (never re-throws —
// the caller re-enters the workflow either way).
export async function runAssetTransform(db: Database, userId: string, assetId: number, item: PickedMediaItem): Promise<AssetRow> {
  try {
    const accessToken = await getValidAccessToken(db, userId);
    if (!accessToken) throw new Error('Google Photos is not connected');

    const plan = planMediaDownload(item);
    const bytes = await downloadPickedMediaItem(accessToken, plan.url);
    const key = `google-photos/${userId}/${item.id}`;
    await storageClient.uploadObject(key, bytes, plan.resultingMimeType);
    const sourceUrl = getStorageObjectUrl(key);

    const metadataPatch: Record<string, unknown> = { mediaType: plan.resultingMimeType };
    if (plan.originalMimeType) metadataPatch['originalMediaType'] = plan.originalMimeType;

    const [row] = await db
      .update(assets)
      .set({
        sourceUrl,
        transformStatus: 'done',
        metadata: sql`${assets.metadata} || ${JSON.stringify(metadataPatch)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .returning();
    return row;
  } catch (err) {
    const [row] = await db
      .update(assets)
      .set({
        transformStatus: 'failed',
        metadata: sql`${assets.metadata} || ${JSON.stringify({ transformErrors: [String(err)] })}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(assets.id, assetId))
      .returning();
    return row;
  }
}
