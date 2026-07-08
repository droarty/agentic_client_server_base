jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { AiService } from './AiService';
import { AiTool } from './tools/registry';

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

// ─── tool-use loop ─────────────────────────────────────────────────────────────

function makeTool(name: string, execute: AiTool['execute']): AiTool {
  return { name, description: `desc for ${name}`, input_schema: { type: 'object', properties: {} }, execute };
}

describe('complete() — tool-use loop', () => {
  test('calls the tool then returns the final text after a tool_use round', async () => {
    const execute = jest.fn().mockResolvedValue('tool result content');
    const tool = makeTool('my_tool', execute);
    const onToolCall = jest.fn();

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'my_tool', input: { foo: 'bar' } }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'final answer' }] });

    const result = await new AiService().complete(
      'sys',
      [{ role: 'user', content: 'hi' }],
      'anthropic',
      { tools: [tool], onToolCall }
    );

    expect(result).toBe('final answer');
    expect(execute).toHaveBeenCalledWith({ foo: 'bar' });
    expect(onToolCall).toHaveBeenCalledWith('my_tool', { foo: 'bar' });
    expect(mockCreate).toHaveBeenCalledTimes(2);

    const secondCallArgs = mockCreate.mock.calls[1][0];
    expect(secondCallArgs.messages).toContainEqual(
      expect.objectContaining({
        role: 'user',
        content: [expect.objectContaining({ type: 'tool_result', tool_use_id: 't1', content: 'tool result content' })],
      })
    );
    expect(secondCallArgs.tools).toEqual([
      { name: 'my_tool', description: 'desc for my_tool', input_schema: { type: 'object', properties: {} } },
    ]);
  });

  test('executes all tool_use blocks in a single turn (parallel tool calls)', async () => {
    const executeA = jest.fn().mockResolvedValue('result A');
    const executeB = jest.fn().mockResolvedValue('result B');
    const toolA = makeTool('tool_a', executeA);
    const toolB = makeTool('tool_b', executeB);

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 't1', name: 'tool_a', input: {} },
          { type: 'tool_use', id: 't2', name: 'tool_b', input: {} },
        ],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] });

    const result = await new AiService().complete(
      'sys',
      [{ role: 'user', content: 'hi' }],
      'anthropic',
      { tools: [toolA, toolB] }
    );

    expect(result).toBe('done');
    expect(executeA).toHaveBeenCalled();
    expect(executeB).toHaveBeenCalled();

    const secondCallArgs = mockCreate.mock.calls[1][0];
    const lastMessage = secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(lastMessage.content).toHaveLength(2);
    expect(lastMessage.content).toEqual([
      expect.objectContaining({ tool_use_id: 't1', content: 'result A' }),
      expect.objectContaining({ tool_use_id: 't2', content: 'result B' }),
    ]);
  });

  test('a throwing tool produces an is_error tool_result and the loop continues', async () => {
    const execute = jest.fn().mockRejectedValue(new Error('boom'));
    const tool = makeTool('flaky_tool', execute);
    const onToolError = jest.fn();

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'flaky_tool', input: {} }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'recovered' }] });

    const result = await new AiService().complete(
      'sys',
      [{ role: 'user', content: 'hi' }],
      'anthropic',
      { tools: [tool], onToolError }
    );

    expect(result).toBe('recovered');
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const toolResult = secondCallArgs.messages[secondCallArgs.messages.length - 1].content[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain('boom');
    expect(onToolError).toHaveBeenCalledWith('flaky_tool', expect.any(Error));
  });

  test('a tool_use block naming an unrecognized tool returns an is_error result without throwing', async () => {
    const tool = makeTool('known_tool', jest.fn().mockResolvedValue('x'));
    const onToolError = jest.fn();

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'unknown_tool', input: {} }],
      })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });

    const result = await new AiService().complete(
      'sys',
      [{ role: 'user', content: 'hi' }],
      'anthropic',
      { tools: [tool], onToolError }
    );

    expect(result).toBe('ok');
    const secondCallArgs = mockCreate.mock.calls[1][0];
    const toolResult = secondCallArgs.messages[secondCallArgs.messages.length - 1].content[0];
    expect(toolResult.is_error).toBe(true);
    expect(onToolError).toHaveBeenCalledWith('unknown_tool', expect.any(Error));
  });

  test('throws after exceeding the max tool-use rounds', async () => {
    const tool = makeTool('infinite_tool', jest.fn().mockResolvedValue('x'));
    mockCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'infinite_tool', input: {} }],
    });

    await expect(
      new AiService().complete('sys', [{ role: 'user', content: 'hi' }], 'anthropic', { tools: [tool] })
    ).rejects.toThrow('exceeded 8 rounds');

    expect(mockCreate).toHaveBeenCalledTimes(8);
  });

  test('honors a maxTurns override instead of the default round limit', async () => {
    const tool = makeTool('infinite_tool', jest.fn().mockResolvedValue('x'));
    mockCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'infinite_tool', input: {} }],
    });

    await expect(
      new AiService().complete('sys', [{ role: 'user', content: 'hi' }], 'anthropic', { tools: [tool], maxTurns: 20 })
    ).rejects.toThrow('exceeded 20 rounds');

    expect(mockCreate).toHaveBeenCalledTimes(20);
  });

  test('does not send a tools param and behaves exactly as before when tools is omitted', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'plain response' }] });

    const result = await new AiService().complete('sys', [{ role: 'user', content: 'hi' }], 'anthropic');

    expect(result).toBe('plain response');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0][0];
    expect(callArgs.tools).toBeUndefined();
  });
});
