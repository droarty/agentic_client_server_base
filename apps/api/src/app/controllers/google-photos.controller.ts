import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  buildGooglePhotosAuthUrl,
  exchangeCodeForTokens,
  saveGooglePhotosTokens,
  getOrCreateGooglePhotosPickerDocument,
} from '../services/google-photos-auth.service';
import { env } from '../config/env';

// The connect->callback round trip goes through Google, which won't carry an
// Authorization header back — the authenticated user's id is threaded through
// via a short-lived signed `state` param instead (reusing the existing JWT
// signing key, matching generateToken's approach in auth.service.ts).
function signState(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: '10m' } as jwt.SignOptions);
}

function verifyState(state: string): string {
  const payload = jwt.verify(state, env.JWT_SECRET) as { userId: string };
  return payload.userId;
}

// Returns the auth URL as JSON rather than redirecting directly — this route
// requires an Authorization header (authMiddleware), which a plain browser
// navigation (e.g. an <a href>) can't send. The frontend calls this via an
// authenticated AJAX request, then navigates the browser itself.
export function connectGooglePhotos(req: AuthRequest, res: Response): void {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    res.status(503).json({ message: 'Google OAuth is not configured' });
    return;
  }
  const state = signState(req.userId as string);
  res.json({ authUrl: buildGooglePhotosAuthUrl(state) });
}

export async function getPickerDocument(req: AuthRequest, res: Response): Promise<void> {
  const channelId = await getOrCreateGooglePhotosPickerDocument(req.userId as string);
  res.json({ channelId });
}

export async function googlePhotosCallback(req: Request, res: Response): Promise<void> {
  const { code, state, error } = req.query as { code?: string; state?: string; error?: string };

  if (error || !code || !state) {
    res.redirect(`${env.CLIENT_URL}/assets/add/google-photos?googlePhotosConnected=0`);
    return;
  }

  let userId: string;
  try {
    userId = verifyState(state);
  } catch {
    res.redirect(`${env.CLIENT_URL}/assets/add/google-photos?googlePhotosConnected=0`);
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGooglePhotosTokens(userId, tokens);
    res.redirect(`${env.CLIENT_URL}/assets/add/google-photos?googlePhotosConnected=1`);
  } catch (err) {
    console.error('googlePhotosCallback failed:', err);
    res.redirect(`${env.CLIENT_URL}/assets/add/google-photos?googlePhotosConnected=0`);
  }
}
