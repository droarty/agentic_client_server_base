import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import { eq, and, or, isNull, gt, desc } from 'drizzle-orm';
import { serviceTokens, GOOGLE_PHOTOS_TOKEN_TYPE, artifacts, channels } from '@agentic-client-server-base/db-schema';
import { WORKFLOW_CONFIG_DIR } from '@agentic-client-server-base/workflow-configs';
import { getDb } from '../db/connect';
import { env } from '../config/env';

const PICKER_ARTIFACT_TYPE = 'google-photos-picker';
const PICKER_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;

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

// Reuses the caller's most recent non-expired picker artifact instead of
// always creating a fresh one. Originally this always-created-fresh on every
// page mount — but a real picking session spans a multi-minute cross-tab
// interaction (open Google's picker, come back), which is exactly the kind
// of interaction a browser is prone to reload a backgrounded tab for. On
// reload the page would create a brand-new, empty document, silently
// abandoning an in-progress or just-completed session. Reusing an existing
// unexpired one means a reload rejoins the same session instead.
export async function getOrCreateGooglePhotosPickerDocument(userId: string): Promise<string> {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(artifacts)
      .where(
        and(
          eq(artifacts.type, PICKER_ARTIFACT_TYPE),
          eq(artifacts.userId, userId),
          or(isNull(artifacts.expiresAt), gt(artifacts.expiresAt, new Date()))
        )
      )
      .orderBy(desc(artifacts.createdAt))
      .limit(1);

    let artifact = existing;
    if (!artifact) {
      let initialState: Record<string, unknown> | undefined;
      const configPath = path.join(WORKFLOW_CONFIG_DIR, `${PICKER_ARTIFACT_TYPE}.json`);
      if (fs.existsSync(configPath)) {
        const wfConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { initialState?: Record<string, unknown> };
        initialState = wfConfig.initialState;
      }
      [artifact] = await tx
        .insert(artifacts)
        .values({
          name: 'Google Photos Import',
          type: PICKER_ARTIFACT_TYPE,
          userId,
          expiresAt: new Date(Date.now() + PICKER_ARTIFACT_TTL_MS),
          ...(initialState !== undefined ? { state: initialState } : {}),
        })
        .returning();
    }

    let [channel] = await tx.select().from(channels).where(eq(channels.artifactId, artifact.id));
    if (!channel) {
      [channel] = await tx
        .insert(channels)
        .values({ workflowType: PICKER_ARTIFACT_TYPE, userId, artifactId: artifact.id })
        .returning();
    }

    return channel.channelId;
  });
}
