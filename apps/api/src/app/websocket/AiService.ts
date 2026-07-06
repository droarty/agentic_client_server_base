import Anthropic from '@anthropic-ai/sdk';

export type AiServiceType = 'anthropic' | 'openai';

export interface AiMessageTurn {
  role: 'user' | 'assistant';
  content: string;
}

export class AiService {
  async complete(
    systemPrompt: string,
    messages: AiMessageTurn[],
    serviceType: AiServiceType,
    options?: { model?: string; maxTokens?: number }
  ): Promise<string> {
    if (serviceType === 'anthropic') {
      return this.callAnthropic(systemPrompt, messages, options);
    }
    throw new Error('OpenAI service not yet configured — add OPENAI_API_KEY to .env');
  }

  private async callAnthropic(
    systemPrompt: string,
    messages: AiMessageTurn[],
    options?: { model?: string; maxTokens?: number }
  ): Promise<string> {
    const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    const message = await client.messages.create({
      model: options?.model ?? 'claude-haiku-4-5-20251001',
      max_tokens: options?.maxTokens ?? 64,
      system: systemPrompt,
      messages,
    });

    const block = message.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') throw new Error('Unexpected Anthropic response type');
    return block.text.trim();
  }
}
