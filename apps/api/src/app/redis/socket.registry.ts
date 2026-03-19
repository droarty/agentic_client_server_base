import { redis } from './redis.client';

const SOCKET_TTL_SECONDS = 86400; // 24 h

export async function registerSocket(socketId: string, userId: string, serverId: string): Promise<void> {
  await redis.setex(`socket:${socketId}`, SOCKET_TTL_SECONDS, JSON.stringify({ userId, serverId }));
}

export async function unregisterSocket(socketId: string): Promise<void> {
  const channels = await redis.smembers(`socket:${socketId}:channels`);
  const pipeline = redis.pipeline();
  for (const channel of channels) {
    pipeline.srem(`channel:${channel}`, socketId);
  }
  pipeline.del(`socket:${socketId}`);
  pipeline.del(`socket:${socketId}:channels`);
  await pipeline.exec();
}
