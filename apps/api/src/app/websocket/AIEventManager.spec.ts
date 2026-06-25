jest.mock('./AiService');
jest.mock('./EventProcessor');

import { AiService } from './AiService';
import { EventProcessor } from './EventProcessor';
import { AIEventManager } from './AIEventManager';
import { ValidateTextMessage } from '@agentic-client-server-base/shared-types';

const flushPromises = () => new Promise(setImmediate);

function makeRequest(overrides: Partial<ValidateTextMessage> = {}): ValidateTextMessage {
  return {
    type: 'validate-text',
    from: 'server',
    to: 'ai-service',
    channel: 'ch-1',
    timestamp: new Date().toISOString(),
    text: 'hello world',
    senderEmail: 'sender@test.com',
    correlationId: 'corr-1',
    ...overrides,
  } as ValidateTextMessage;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── valid-text response ──────────────────────────────────────────────────────

describe('valid-text response', () => {
  test('fires valid-text AiResponse to EventProcessor with text and correlationId', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"valid-text"}');
    new AIEventManager().publish(makeRequest({ text: 'safe text', correlationId: 'c-1' }));
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'valid-text', text: 'safe text', channel: 'ch-1', correlationId: 'c-1' }),
      undefined
    );
  });
});

// ─── inappropriate-text response ──────────────────────────────────────────────

describe('inappropriate-text response', () => {
  test('fires inappropriate-text AiResponse without text field', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"inappropriate-text"}');
    new AIEventManager().publish(makeRequest());
    await flushPromises();
    const [response] = (EventProcessor.prototype.process as jest.Mock).mock.calls[0];
    expect(response.type).toBe('inappropriate-text');
    expect(response.text).toBeUndefined();
  });
});

// ─── markdown code fence stripping ────────────────────────────────────────────

describe('markdown code fence stripping', () => {
  test('strips ```json fences before parsing', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('```json\n{"type":"valid-text"}\n```');
    new AIEventManager().publish(makeRequest());
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'valid-text' }),
      undefined
    );
  });

  test('strips plain ``` fences before parsing', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('```\n{"type":"inappropriate-text"}\n```');
    new AIEventManager().publish(makeRequest());
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'inappropriate-text' }),
      undefined
    );
  });
});

// ─── error paths (swallowed by publish()) ────────────────────────────────────

describe('error paths — swallowed by publish()', () => {
  test('invalid JSON → publish() does not throw, console.error called', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('not-json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => new AIEventManager().publish(makeRequest())).not.toThrow();
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  test('unknown type → publish() does not throw, console.error called', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"banana"}');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => new AIEventManager().publish(makeRequest())).not.toThrow();
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ─── user context ─────────────────────────────────────────────────────────────

describe('user context', () => {
  test('user forwarded to EventProcessor.process as second argument', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"valid-text"}');
    const user = { id: 'u-1', email: 'u@test.com' };
    new AIEventManager().publish(makeRequest(), undefined, user);
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(expect.anything(), user);
  });
});
