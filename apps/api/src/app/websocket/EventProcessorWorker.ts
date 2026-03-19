import { parentPort } from 'worker_threads';
import Redis from 'ioredis';
import { WsServerMessage } from '@multiplayer-base/shared-types';

const redis = new Redis(process.env['REDIS_URL'] || 'redis://localhost:6379', {
  enableReadyCheck: false,
});

redis.on('error', (err) => console.error('EventProcessorWorker Redis error:', err.message));

import { PUBSUB_CHANNEL, DeliveryInstruction, WorkerInput } from './EventProcessorTypes';

parentPort!.on('message', async ({ channel, message }: WorkerInput) => {
  // --- Processing pipeline ---
  // This is where future logic lives: filtering, transformation, persistence, etc.
  // Processing may be long-running. It may decide not to send anything at all.

  const socketIds = await redis.smembers(`channel:${channel}`);

  // Processing decided there are no recipients — nothing to send
  if (socketIds.length === 0) return;

  const frame = JSON.stringify(
    { type: 'channel-message', channel, message } satisfies WsServerMessage
  );

  // Publish the delivery instruction — all server instances will deliver to their local sockets
  await redis.publish(
    PUBSUB_CHANNEL,
    JSON.stringify({ frame, socketIds } satisfies DeliveryInstruction)
  );
});
