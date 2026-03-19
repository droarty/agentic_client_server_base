import Redis from 'ioredis';
import { env } from '../config/env';

// Separate clients required: a subscriber client cannot issue regular commands.
// enableReadyCheck must be false on redisSub — ioredis sends an INFO command as
// a ready-check after connecting, but Redis rejects INFO once the client is in
// pub/sub mode.
export const redis = new Redis(env.REDIS_URL);
export const redisSub = new Redis(env.REDIS_URL, { enableReadyCheck: false });

redis.on('error', (err) => console.error('Redis error:', err.message));
redisSub.on('error', (err) => console.error('Redis sub error:', err.message));
