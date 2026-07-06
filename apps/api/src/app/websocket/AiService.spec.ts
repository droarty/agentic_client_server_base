jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { AiService } from './AiService';

const mockCreate = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => ({
    messages: { create: mockCreate },
  }) as any);
});

// ─── anthropic service type ───────────────────────────────────────────────────

describe('complete() — anthropic', () => {
  test('returns trimmed text from first content block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '  response text  ' }] });
    const result = await new AiService().complete('sys prompt', [{ role: 'user', content: 'user prompt' }], 'anthropic');
    expect(result).toBe('response text');
  });

  test('passes system prompt and messages to Anthropic SDK', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await new AiService().complete('my system', [{ role: 'user', content: 'my user' }], 'anthropic');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'my system',
        messages: [{ role: 'user', content: 'my user' }],
      })
    );
  });

  test('passes a full multi-turn conversation through unchanged', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const messages = [
      { role: 'user' as const, content: 'first' },
      { role: 'assistant' as const, content: 'reply' },
      { role: 'user' as const, content: 'second' },
    ];
    await new AiService().complete('sys', messages, 'anthropic');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ messages }));
  });

  test('throws when first content block is not text type', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 'tool-1' }] });
    await expect(
      new AiService().complete('sys', [{ role: 'user', content: 'user' }], 'anthropic')
    ).rejects.toThrow('Unexpected Anthropic response type');
  });
});

// ─── openai service type ──────────────────────────────────────────────────────

describe('complete() — openai', () => {
  test('throws not-configured error', async () => {
    await expect(
      new AiService().complete('sys', [{ role: 'user', content: 'user' }], 'openai')
    ).rejects.toThrow('OpenAI service not yet configured');
  });
});
