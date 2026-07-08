jest.mock('./AiService');
jest.mock('./EventProcessor');

import { AiService } from './AiService';
import { EventProcessor } from './EventProcessor';
import { AIEventManager } from './AIEventManager';
import { AiStepConfig } from './WorkflowEngine';
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

  test('recovers a JSON object even when the model prepends explanatory prose before it', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue(
      'This feature is not currently supported by this system.\n\n{"type":"valid-text"}'
    );
    new AIEventManager().publish(makeRequest());
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'valid-text' }),
      undefined
    );
  });

  test('still throws when no JSON object is present at all', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('Sorry, I cannot help with that.');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => new AIEventManager().publish(makeRequest())).not.toThrow();
    await flushPromises();
    expect(spy).toHaveBeenCalledWith('AIEventManager error:', expect.objectContaining({ message: expect.stringContaining('invalid JSON') }));
    spy.mockRestore();
  });
});

// ─── error paths (swallowed by publish()) ────────────────────────────────────

describe('error paths — swallowed by publish()', () => {
  test('invalid JSON → publish() does not throw, console.error called, logged as logType: error', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('not-json');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logWorkflowStep = jest.fn();
    expect(() => new AIEventManager({ logWorkflowStep }).publish(makeRequest())).not.toThrow();
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error', errorMessage: 'AI step failed' }));
    spy.mockRestore();
  });

  test('unknown type → publish() does not throw, console.error called, logged as logType: error', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"banana"}');
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logWorkflowStep = jest.fn();
    expect(() => new AIEventManager({ logWorkflowStep }).publish(makeRequest())).not.toThrow();
    await flushPromises();
    expect(spy).toHaveBeenCalled();
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error', errorMessage: 'AI step failed' }));
    spy.mockRestore();
  });
});

// ─── responseSchema validation ─────────────────────────────────────────────────

describe('responseSchema validation', () => {
  const config: AiStepConfig = {
    model: 'claude-sonnet-5',
    maxTokens: 4096,
    systemPrompt: 'system prompt',
    responseTypes: ['requirements-reply-with-summary'],
    responseSchema: {
      'requirements-reply-with-summary': { reply: 'string', requirementsSummary: 'string', ready: 'boolean' },
    },
  };

  test('field with wrong type → publish() does not throw, EventProcessor never called, logged as logType: error', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue(
      '{"type":"requirements-reply-with-summary","reply":"ok","requirementsSummary":{"type":0,"data":{"0":0}},"ready":true}'
    );
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logWorkflowStep = jest.fn();
    expect(() => new AIEventManager({ logWorkflowStep }).publish(makeRequest(), config)).not.toThrow();
    await flushPromises();
    expect(EventProcessor.prototype.process).not.toHaveBeenCalled();
    expect(logWorkflowStep).toHaveBeenCalledWith(expect.objectContaining({ logType: 'error', errorMessage: 'AI step failed' }));
    spy.mockRestore();
  });

  test('matching schema → EventProcessor called with parsed fields', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue(
      '{"type":"requirements-reply-with-summary","reply":"ok","requirementsSummary":"a summary","ready":true}'
    );
    new AIEventManager().publish(makeRequest(), config);
    await flushPromises();
    expect(EventProcessor.prototype.process).toHaveBeenCalledWith(
      expect.objectContaining({ requirementsSummary: 'a summary', ready: true }),
      undefined
    );
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

// ─── tools wiring ──────────────────────────────────────────────────────────────

describe('tools wiring', () => {
  test('config.tools names are resolved to real tools and passed to AiService.complete', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"valid-text"}');
    const config: AiStepConfig = {
      model: 'claude-sonnet-5',
      maxTokens: 100,
      systemPrompt: 'sys',
      tools: ['get_reference_section'],
    };
    new AIEventManager().publish(makeRequest(), config);
    await flushPromises();
    const [, , , options] = (AiService.prototype.complete as jest.Mock).mock.calls[0];
    expect(options.tools).toEqual([expect.objectContaining({ name: 'get_reference_section' })]);
  });

  test('config without tools passes tools: undefined (unchanged single-shot behavior)', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"valid-text"}');
    new AIEventManager().publish(makeRequest());
    await flushPromises();
    const [, , , options] = (AiService.prototype.complete as jest.Mock).mock.calls[0];
    expect(options.tools).toBeUndefined();
  });

  test('config.maxTurns is passed through to AiService.complete', async () => {
    (AiService.prototype.complete as jest.Mock).mockResolvedValue('{"type":"valid-text"}');
    const config: AiStepConfig = {
      model: 'claude-sonnet-5',
      maxTokens: 16000,
      maxTurns: 20,
      systemPrompt: 'sys',
      tools: ['get_reference_section'],
    };
    new AIEventManager().publish(makeRequest(), config);
    await flushPromises();
    const [, , , options] = (AiService.prototype.complete as jest.Mock).mock.calls[0];
    expect(options.maxTurns).toBe(20);
  });

  test('onToolCall logs a tool entry including the tool input', async () => {
    const logWorkflowStep = jest.fn();
    (AiService.prototype.complete as jest.Mock).mockImplementation(async (_sys, _msgs, _type, options) => {
      options.onToolCall('get_reference_section', { section: 'steps-and-routes' });
      return '{"type":"valid-text"}';
    });
    const config: AiStepConfig = {
      model: 'claude-sonnet-5',
      maxTokens: 100,
      systemPrompt: 'sys',
      tools: ['get_reference_section'],
    };
    new AIEventManager({ logWorkflowStep }).publish(makeRequest({ correlationId: 'exec-1:2' }), config);
    await flushPromises();
    expect(logWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({
        logType: 'tool',
        executionId: 'exec-1',
        stepIndex: 2,
        message: { tool: 'get_reference_section', input: { section: 'steps-and-routes' } },
      })
    );
  });

  test('onToolError logs a logType: error entry', async () => {
    const logWorkflowStep = jest.fn();
    (AiService.prototype.complete as jest.Mock).mockImplementation(async (_sys, _msgs, _type, options) => {
      options.onToolError('get_reference_section', new Error('boom'));
      return '{"type":"valid-text"}';
    });
    const config: AiStepConfig = {
      model: 'claude-sonnet-5',
      maxTokens: 100,
      systemPrompt: 'sys',
      tools: ['get_reference_section'],
    };
    new AIEventManager({ logWorkflowStep }).publish(makeRequest(), config);
    await flushPromises();
    expect(logWorkflowStep).toHaveBeenCalledWith(
      expect.objectContaining({ logType: 'error', errorMessage: 'tool "get_reference_section" failed', errorDetail: expect.stringContaining('boom') })
    );
  });
});
