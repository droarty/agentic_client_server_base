import crypto from 'crypto';

const CODE_TTL_MS = 60_000;
const store = new Map<string, { token: string; expiresAt: number }>();

export function createOAuthCode(token: string): string {
  const code = crypto.randomBytes(32).toString('hex');
  store.set(code, { token, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

export function redeemOAuthCode(code: string): string | null {
  const entry = store.get(code);
  store.delete(code);
  if (!entry || Date.now() > entry.expiresAt) return null;
  return entry.token;
}
