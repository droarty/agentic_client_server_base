import { redis } from './redis.client';

export async function addSocketToChannel(socketId: string, channel: string): Promise<void> {
  await redis.pipeline()
    .sadd(`channel:${channel}`, socketId)
    .sadd(`socket:${socketId}:channels`, channel)
    .exec();
}

export async function getChannelSockets(channel: string): Promise<string[]> {
  return redis.smembers(`channel:${channel}`);
}
