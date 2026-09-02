import { eq, sql } from 'drizzle-orm';
import { type Database, assets } from '@agentic-client-server-base/db-schema';
import {
  getValidAccessToken,
  planMediaDownload,
  planThumbnailDownload,
  isVideoReady,
  downloadPickedMediaItem,
  PickedMediaItem,
} from './google-photos-picker.client';
import { storageClient, getStorageObjectUrl } from './r2-storage.client';

type AssetRow = typeof assets.$inferSelect;

interface VideoDownloadResult {
  thumbnailSrc: string;
  sourceUrl: string | null;
  resultingMimeType: string;
  ready: boolean;
}

// Two-upload flow for VIDEO items: the thumbnail is always attempted first
// (google-photos/{userId}/{item.id}-thumbnail), so the row has something to
// show even when the full video isn't ready yet. The full video
// (google-photos/{userId}/{item.id}, same key as before this change) is
// only downloaded once isVideoReady(item) is true — Google's =dv suffix
// doesn't reliably return usable bytes before the source reports READY.
// Throws on any download/upload failure, same as the PHOTO path below —
// the caller's outer try/catch is the single error-handling path.
async function downloadVideoMedia(accessToken: string, userId: string, item: PickedMediaItem): Promise<VideoDownloadResult> {
  const thumbnailPlan = planThumbnailDownload(item);
  const thumbnailBytes = await downloadPickedMediaItem(accessToken, thumbnailPlan.url);
  const thumbnailKey = `google-photos/${userId}/${item.id}-thumbnail`;
  await storageClient.uploadObject(thumbnailKey, thumbnailBytes, thumbnailPlan.resultingMimeType);
  const thumbnailSrc = getStorageObjectUrl(thumbnailKey);

  if (!isVideoReady(item)) {
    return { thumbnailSrc, sourceUrl: null, resultingMimeType: item.mediaFile.mimeType, ready: false };
  }

  const videoPlan = planMediaDownload(item);
  const videoBytes = await downloadPickedMediaItem(accessToken, videoPlan.url);
  const videoKey = `google-photos/${userId}/${item.id}`;
  await storageClient.uploadObject(videoKey, videoBytes, videoPlan.resultingMimeType);
  const sourceUrl = getStorageObjectUrl(videoKey);

  return { thumbnailSrc, sourceUrl, resultingMimeType: videoPlan.resultingMimeType, ready: true };
}

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

    if (item.type === 'VIDEO') {
      const result = await downloadVideoMedia(accessToken, userId, item);

      if (!result.ready) {
        // Thumbnail persisted so the row isn't a total dead end, but the
        // video itself isn't downloadable yet — there's no
        // retry/polling mechanism in this codebase (fire-and-forget
        // one-shot architecture), so this is the most honest terminal
        // state available. sourceUrl stays null (never set here).
        const [row] = await db
          .update(assets)
          .set({
            thumbnailSrc: result.thumbnailSrc,
            transformStatus: 'failed',
            metadata: sql`${assets.metadata} || ${JSON.stringify({
              transformErrors: ['Video is still processing at the source; try again later.'],
            })}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(assets.id, assetId))
          .returning();
        return row;
      }

      const [row] = await db
        .update(assets)
        .set({
          sourceUrl: result.sourceUrl,
          thumbnailSrc: result.thumbnailSrc,
          transformStatus: 'done',
          metadata: sql`${assets.metadata} || ${JSON.stringify({ mediaType: result.resultingMimeType })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(assets.id, assetId))
        .returning();
      return row;
    }

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
