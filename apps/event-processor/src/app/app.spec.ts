import request from 'supertest';
import type { Application } from 'express';
import type { EventProcessorRequest } from '@agentic-client-server-base/shared-types';

const TOKEN = 'test-internal-token';

function loadApp(handleInboundEvent: jest.Mock): Application {
  process.env['INTERNAL_SERVICE_TOKEN'] = TOKEN;
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createApp } = require('./app');
  return createApp(handleInboundEvent) as Application;
}

describe('POST /internal/events', () => {
  let handleInboundEvent: jest.Mock;
  let app: Application;

  beforeEach(() => {
    handleInboundEvent = jest.fn().mockResolvedValue(undefined);
    app = loadApp(handleInboundEvent);
  });

  test('valid bearer token → 202 accepted, handleInboundEvent invoked with the request body', async () => {
    const body: EventProcessorRequest = {
      message: { type: 'add-text', channel: 'ch-1' },
      user: { id: 'u-1', email: 'u@test.com' },
    };

    const res = await request(app)
      .post('/internal/events')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send(body);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ accepted: true });
    expect(handleInboundEvent).toHaveBeenCalledWith(body);
  });

  test('missing token → 401, handleInboundEvent never invoked', async () => {
    const res = await request(app)
      .post('/internal/events')
      .send({ message: { type: 'add-text', channel: 'ch-1' } });

    expect(res.status).toBe(401);
    expect(handleInboundEvent).not.toHaveBeenCalled();
  });

  test('invalid token → 401, handleInboundEvent never invoked', async () => {
    const res = await request(app)
      .post('/internal/events')
      .set('Authorization', 'Bearer wrong-token')
      .send({ message: { type: 'add-text', channel: 'ch-1' } });

    expect(res.status).toBe(401);
    expect(handleInboundEvent).not.toHaveBeenCalled();
  });
});

describe('POST /internal/events with no INTERNAL_SERVICE_TOKEN configured (local dev default)', () => {
  test('requests are accepted without a bearer token', async () => {
    process.env['INTERNAL_SERVICE_TOKEN'] = '';
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createApp } = require('./app');
    const handleInboundEvent = jest.fn().mockResolvedValue(undefined);
    const app = createApp(handleInboundEvent) as Application;

    const res = await request(app)
      .post('/internal/events')
      .send({ message: { type: 'add-text', channel: 'ch-1' } });

    expect(res.status).toBe(202);
    expect(handleInboundEvent).toHaveBeenCalled();
  });
});
