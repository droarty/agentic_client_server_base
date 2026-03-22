import Anthropic from '@anthropic-ai/sdk';

export type AiServiceType = 'anthropic' | 'openai';

export class AiService {
  async complete(
    systemPrompt: string,
    userPrompt: string,
    serviceType: AiServiceType
  ): Promise<string> {
    if (serviceType === 'anthropic') {
      return this.callAnthropic(systemPrompt, userPrompt);
    }
    throw new Error('OpenAI service not yet configured — add OPENAI_API_KEY to .env');
  }

  private async callAnthropic(systemPrompt: string, userPrompt: string): Promise<string> {
    const client = new Anthropic({ apiKey: process.env['ANTHROPIC_API_KEY'] });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 64,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const block = message.content[0];
    if (block.type !== 'text') throw new Error('Unexpected Anthropic response type');
    return block.text.trim();
  }
}
