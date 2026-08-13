import * as crypto from 'crypto';
import express, { Application } from 'express';
import { EventProcessorRequest, InternalEventResponse } from '@agentic-client-server-base/shared-types';
import { env } from './config/env';

function isValidInternalToken(provided: string | undefined): boolean {
  // env.ts already refuses to boot in production with an empty token; outside
  // production an unset token means local dev hasn't configured one, so treat
  // the endpoint as unauthenticated rather than rejecting every request by
  // default (an empty provided token would otherwise always fail the length
  // check below, since '' is falsy).
  if (!env.INTERNAL_SERVICE_TOKEN) return true;
  if (!provided) return false;
  const expected = Buffer.from(env.INTERNAL_SERVICE_TOKEN);
  const providedBuf = Buffer.from(provided);
  if (providedBuf.length !== expected.length) return false;
  return crypto.timingSafeEqual(providedBuf, expected);
}

export function createApp(handleInboundEvent: (input: EventProcessorRequest) => Promise<void>): Application {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.post('/internal/events', (req, res) => {
    const authHeader = req.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!isValidInternalToken(token)) {
      res.status(401).json({ message: 'invalid or missing internal service token' });
      return;
    }

    const input = req.body as EventProcessorRequest;
    handleInboundEvent(input).catch((err) => console.error('handleInboundEvent error:', err));
    res.status(202).json({ accepted: true } satisfies InternalEventResponse);
  });

  return app;
}
