import { AccessLevel } from './access-level';

export function createAccessLevelCache(ttlMs: number) {
  const cache = new Map<string, { level: AccessLevel; expiresAt: number }>();

  async function get(
    userId: string,
    channel: string,
    compute: () => Promise<AccessLevel>
  ): Promise<AccessLevel> {
    const key = `${userId}:${channel}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.level;
    const level = await compute();
    cache.set(key, { level, expiresAt: Date.now() + ttlMs });
    return level;
  }

  return { get };
}
