import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { type Database, serviceTokens, GOOGLE_PHOTOS_TOKEN_TYPE } from '@agentic-client-server-base/db-schema';
import { env } from '../config/env';

const pickerClient = axios.create({ baseURL: 'https://photospicker.googleapis.com', timeout: 10000 });
const tokenClient = axios.create({ baseURL: 'https://oauth2.googleapis.com', timeout: 5000 });

// Refresh a little before actual expiry so a slow request doesn't land after
// the token has already died.
const REFRESH_MARGIN_MS = 60 * 1000;

interface RefreshTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

// Reads the user's stored Google Photos token, refreshing it first if it's
// expired or about to be. Returns null if the user has never connected
// Google Photos. This duplicates apps/api's GOOGLE_CLIENT_ID/SECRET into this
// service (event-processor's env) — an accepted tradeoff of driving the
// picker flow through the workflow engine rather than apps/api's REST layer.
export async function getValidAccessToken(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(serviceTokens)
    .where(and(eq(serviceTokens.userId, userId), eq(serviceTokens.tokenType, GOOGLE_PHOTOS_TOKEN_TYPE)));
  if (!row) return null;

  if (row.expiresAt.getTime() - REFRESH_MARGIN_MS > Date.now()) {
    return row.accessToken;
  }

  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: row.refreshToken,
    grant_type: 'refresh_token',
  });
  const { data } = await tokenClient.post<RefreshTokenResponse>('/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db
    .update(serviceTokens)
    .set({ accessToken: data.access_token, expiresAt, scope: data.scope, updatedAt: new Date() })
    .where(and(eq(serviceTokens.userId, userId), eq(serviceTokens.tokenType, GOOGLE_PHOTOS_TOKEN_TYPE)));

  return data.access_token;
}

// Pure existence check — doesn't validate/refresh the token, just whether the
// user has ever connected. Used to decide which UI to show (connect vs.
// pick), not to authorize an actual API call.
export async function hasGooglePhotosConnection(db: Database, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: serviceTokens.id })
    .from(serviceTokens)
    .where(and(eq(serviceTokens.userId, userId), eq(serviceTokens.tokenType, GOOGLE_PHOTOS_TOKEN_TYPE)));
  return !!row;
}

export interface PickerSession {
  id: string;
  pickerUri: string;
  pollingConfig?: { pollInterval?: string; timeoutIn?: string };
  expireTime: string;
  mediaItemsSet?: boolean;
}

// Google's pollingConfig.pollInterval comes back as a protobuf Duration
// string like "5s" or "5.5s" — parse the leading numeric part, falling back
// to a sane default if the field is absent or unparseable.
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
export function parsePollIntervalSeconds(pollInterval?: string): number {
  if (!pollInterval) return DEFAULT_POLL_INTERVAL_SECONDS;
  const parsed = parseFloat(pollInterval);
  return Number.isFinite(parsed) && parsed > 0 ? Math.ceil(parsed) : DEFAULT_POLL_INTERVAL_SECONDS;
}

export async function createPickerSession(accessToken: string): Promise<PickerSession> {
  const { data } = await pickerClient.post<PickerSession>(
    '/v1/sessions',
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return data;
}

export async function getPickerSessionStatus(accessToken: string, sessionId: string): Promise<PickerSession> {
  const { data } = await pickerClient.get<PickerSession>(`/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data;
}

export interface PickedMediaItem {
  id: string;
  createTime: string;
  type: 'PHOTO' | 'VIDEO';
  mediaFile: {
    baseUrl: string;
    mimeType: string;
    filename: string;
    mediaFileMetadata?: Record<string, unknown>;
  };
}

export async function listPickedMediaItems(accessToken: string, sessionId: string): Promise<PickedMediaItem[]> {
  const { data } = await pickerClient.get<{ mediaItems?: PickedMediaItem[] }>('/v1/mediaItems', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { sessionId },
  });
  return data.mediaItems ?? [];
}

export interface MediaDownloadPlan {
  url: string;
  resultingMimeType: string;
  // Set only when a conversion actually happened (HEIC/HEIF -> JPEG).
  originalMimeType?: string;
}

const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif']);

// Per Google's docs, appending `=d` to baseUrl downloads the original bytes
// unmodified. Appending a resize suffix instead makes Google re-encode the
// result, and for a HEIC/HEIF source that re-encode comes back as JPEG — so
// reusing the resize param at the original dimensions is a free HEIC->JPEG
// conversion (most non-Safari browsers can't render HEIC inline).
export function planMediaDownload(item: PickedMediaItem): MediaDownloadPlan {
  const { baseUrl, mimeType, mediaFileMetadata } = item.mediaFile;
  if (item.type === 'PHOTO' && HEIC_MIME_TYPES.has(mimeType)) {
    const width = mediaFileMetadata?.['width'];
    const height = mediaFileMetadata?.['height'];
    if (typeof width === 'number' && typeof height === 'number') {
      return { url: `${baseUrl}=w${width}-h${height}`, resultingMimeType: 'image/jpeg', originalMimeType: mimeType };
    }
    // No dimensions on record (unexpected but not fatal) — fall through to
    // a plain download; it'll stay HEIC and hit the frontend's
    // can't-render-inline placeholder, same as before this existed.
  }
  if (item.type === 'VIDEO') {
    // `=d` (a plain download) does not reliably return full video bytes for
    // VIDEO items, unlike photos — `=dv` is the documented suffix for
    // downloading actual video bytes. Caller (asset-transform.ts) must only
    // invoke this once isVideoReady(item) is true; this function itself is
    // a pure item->plan mapper and doesn't gate on readiness.
    return { url: `${baseUrl}=dv`, resultingMimeType: mimeType };
  }
  return { url: `${baseUrl}=d`, resultingMimeType: mimeType };
}

// Google's Picker API nests video readiness under
// mediaFile.mediaFileMetadata.videoMetadata.processingStatus (not
// videoMediaMetadata) — one level deeper than width/height, which sit
// directly on mediaFileMetadata. Enum values per Google's docs:
// UNSPECIFIED | PROCESSING | READY | FAILED.
export type VideoProcessingStatus = 'UNSPECIFIED' | 'PROCESSING' | 'READY' | 'FAILED';

export function getVideoProcessingStatus(item: PickedMediaItem): VideoProcessingStatus | undefined {
  const videoMetadata = item.mediaFile.mediaFileMetadata?.['videoMetadata'] as Record<string, unknown> | undefined;
  const status = videoMetadata?.['processingStatus'];
  return typeof status === 'string' ? (status as VideoProcessingStatus) : undefined;
}

// The single source of truth for "is it safe to attempt the =dv download
// yet" — used by asset-transform.ts to gate the full-video download.
export function isVideoReady(item: PickedMediaItem): boolean {
  return getVideoProcessingStatus(item) === 'READY';
}

const DEFAULT_THUMBNAIL_WIDTH = 512;
const DEFAULT_THUMBNAIL_HEIGHT = 512;

// Builds a download plan for a static JPEG thumbnail frame of a VIDEO item,
// via the same resize-suffix mechanism already used for HEIC photos above —
// applying a resize suffix to a video's baseUrl makes Google return a
// static frame image, not video bytes, regardless of processingStatus (so
// this is safe to call even before the video itself is READY). Falls back
// to a sane default size if width/height aren't present in metadata.
export function planThumbnailDownload(item: PickedMediaItem): MediaDownloadPlan {
  const { baseUrl, mediaFileMetadata } = item.mediaFile;
  const width = mediaFileMetadata?.['width'];
  const height = mediaFileMetadata?.['height'];
  const w = typeof width === 'number' ? width : DEFAULT_THUMBNAIL_WIDTH;
  const h = typeof height === 'number' ? height : DEFAULT_THUMBNAIL_HEIGHT;
  return { url: `${baseUrl}=w${w}-h${h}`, resultingMimeType: 'image/jpeg' };
}

const mediaDownloadClient = axios.create({ timeout: 30000 });

// baseUrl (with or without a suffix) points at lh3.googleusercontent.com, a
// different host than pickerClient's photospicker.googleapis.com baseURL —
// plain axios call, no shared client. Requires the same OAuth bearer token
// as the Picker API itself; not fetchable anonymously.
export async function downloadPickedMediaItem(accessToken: string, url: string): Promise<Buffer> {
  const { data } = await mediaDownloadClient.get<ArrayBuffer>(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    responseType: 'arraybuffer',
  });
  return Buffer.from(data);
}
