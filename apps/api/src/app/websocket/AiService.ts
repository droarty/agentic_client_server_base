import Anthropic from '@anthropic-ai/sdk';
import { AiTool } from './tools/registry';

export type AiServiceType = 'anthropic' | 'openai';

export interface AiMessageTurn {
  role: 'user' | 'assistant';
  content: string;
}

// Bounded so a model that keeps calling tools can never loop forever; sized
// with headroom for a handful of lookups across one turn, not just one.
const MAX_TOOL_ROUNDS = 8;

export class AiService {
  async complete(
    systemPrompt: string,
    messages: AiMessageTurn[],
    serviceType: AiServiceType,
    options?: {
      model?: string;
      maxTokens?: number;
      tools?: AiTool[];
      onToolCall?: (toolName: string, input: Record<string, unknown>) => void;
      onToolError?: (toolName: string, error: unknown) => void;
    }
  ): Promise<string> {
    if (serviceType === 'anthropic') {
      return this.callAnthropic(systemPrompt, messages, options);
    }
    throw new Error('OpenAI service not yet configured — add OPENAI_API_KEY to .env');
  }

  private async callAnthropic(
    systemPrompt: string,
    messages: AiMessageTurn[],
    options?: {
      model?: string;
      maxTokens?: number;
      tools?: AiTool[];
      onToolCall?: (toolName: string, input: Record<string, unknown>) => void;
      onToolError?: (toolName: string, error: unknown) => void;
    }
  ): Promise<string> {
    const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    const model = options?.model ?? 'claude-haiku-4-5-20251001';
    const maxTokens = options?.maxTokens ?? 64;
    const tools = options?.tools;
    const toolDefs: Anthropic.Tool[] | undefined = tools?.length
      ? tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.input_schema as Anthropic.Tool.InputSchema,
        }))
      : undefined;

    const working: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const message = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: working,
        ...(toolDefs ? { tools: toolDefs } : {}),
      });

      const toolUseBlocks = toolDefs
        ? message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        : [];

      if (!toolDefs || message.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        const block = message.content.find((b) => b.type === 'text');
        if (!block || block.type !== 'text') throw new Error('Unexpected Anthropic response type');
        return block.text.trim();
      }

      toolUseBlocks.forEach((block) => options?.onToolCall?.(block.name, (block.input ?? {}) as Record<string, unknown>));

      working.push({ role: 'assistant', content: message.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async (block): Promise<Anthropic.ToolResultBlockParam> => {
          const tool = tools!.find((t) => t.name === block.name);
          if (!tool) {
            options?.onToolError?.(block.name, new Error(`Unknown tool: ${block.name}`));
            return { type: 'tool_result', tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true };
          }
          try {
            const result = await tool.execute((block.input ?? {}) as Record<string, unknown>);
            return { type: 'tool_result', tool_use_id: block.id, content: result };
          } catch (err) {
            options?.onToolError?.(block.name, err);
            return { type: 'tool_result', tool_use_id: block.id, content: String(err), is_error: true };
          }
        })
      );
      working.push({ role: 'user', content: toolResults });
    }

    throw new Error(`AI tool loop exceeded ${MAX_TOOL_ROUNDS} rounds without a final response`);
  }
}
