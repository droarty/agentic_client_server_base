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
    const result = await new AiService().complete('sys prompt', 'user prompt', 'anthropic');
    expect(result).toBe('response text');
  });

  test('passes system prompt and user prompt to Anthropic SDK', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    await new AiService().complete('my system', 'my user', 'anthropic');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'my system',
        messages: [{ role: 'user', content: 'my user' }],
      })
    );
  });

  test('throws when first content block is not text type', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'tool_use', id: 'tool-1' }] });
    await expect(new AiService().complete('sys', 'user', 'anthropic')).rejects.toThrow(
      'Unexpected Anthropic response type'
    );
  });
});

// ─── openai service type ──────────────────────────────────────────────────────

describe('complete() — openai', () => {
  test('throws not-configured error', async () => {
    await expect(new AiService().complete('sys', 'user', 'openai')).rejects.toThrow(
      'OpenAI service not yet configured'
    );
  });
});
