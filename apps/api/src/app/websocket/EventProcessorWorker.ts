import { parentPort } from 'worker_threads';
import Redis from 'ioredis';
import { AnyMessage, WsServerMessage } from '@multiplayer-base/shared-types';

// Worker owns its own Redis connection — connections cannot be shared across threads
const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

export interface WorkerInput {
  channel: string;
  message: AnyMessage;
}

export interface WorkerOutput {
  frame: string;
  socketIds: string[];
}

parentPort!.on('message', async ({ channel, message }: WorkerInput) => {
  const socketIds = await redis.smembers(`channel:${channel}`);
  const frame = JSON.stringify(
    { type: 'channel-message', channel, message } satisfies WsServerMessage
  );
  parentPort!.postMessage({ frame, socketIds } satisfies WorkerOutput);
});
