import axios from 'axios';
import { eq, and } from 'drizzle-orm';
import { serviceTokens, GOOGLE_PHOTOS_TOKEN_TYPE } from '@agentic-client-server-base/db-schema';
import { getDb } from '../db/connect';
import { env } from '../config/env';

// Confirm this exact scope string in Google Cloud Console / current Photos
// API docs before shipping — not confirmed via live docs at plan time.
export const GOOGLE_PHOTOS_SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

const tokenClient = axios.create({ baseURL: 'https://oauth2.googleapis.com', timeout: 5000 });

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

export function buildGooglePhotosAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_PHOTOS_CALLBACK_URL,
    response_type: 'code',
    scope: GOOGLE_PHOTOS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// Distinct scope grant from login, so this is a plain code exchange rather
// than routed through the passport Google strategy (which is wired for the
// login flow's scopes/session handling, not this one-shot grant).
export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: env.GOOGLE_PHOTOS_CALLBACK_URL,
  });
  const { data } = await tokenClient.post<GoogleTokenResponse>('/token', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return data;
}

// Google only returns refresh_token on the first consent (or when
// prompt=consent forces re-consent, which the connect flow always sets) —
// preserve the existing one on re-connect if Google omits it.
export async function saveGooglePhotosTokens(userId: string, tokens: GoogleTokenResponse): Promise<void> {
  const db = getDb();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  if (tokens.refresh_token) {
    await db
      .insert(serviceTokens)
      .values({
        userId,
        tokenType: GOOGLE_PHOTOS_TOKEN_TYPE,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scope: tokens.scope,
      })
      .onConflictDoUpdate({
        target: [serviceTokens.userId, serviceTokens.tokenType],
        set: { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt, scope: tokens.scope, updatedAt: new Date() },
      });
    return;
  }

  const [existing] = await db
    .select()
    .from(serviceTokens)
    .where(and(eq(serviceTokens.userId, userId), eq(serviceTokens.tokenType, GOOGLE_PHOTOS_TOKEN_TYPE)));
  if (!existing) {
    throw new Error('Google did not return a refresh token and no existing Google Photos connection was found for this user');
  }
  await db
    .update(serviceTokens)
    .set({ accessToken: tokens.access_token, expiresAt, scope: tokens.scope, updatedAt: new Date() })
    .where(and(eq(serviceTokens.userId, userId), eq(serviceTokens.tokenType, GOOGLE_PHOTOS_TOKEN_TYPE)));
}
