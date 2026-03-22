import { ValidateTextMessage, AiResponse } from '@multiplayer-base/shared-types';
import { AiService } from './AiService';
import { EventProcessor } from './EventProcessor';
import { env } from '../config/env';

const SYSTEM_PROMPT =
  'You are a content moderation assistant. Evaluate whether the provided text contains inappropriate content.\n\n' +
  'You MUST respond with valid JSON only — no markdown, no explanation, no code blocks.\n' +
  'The response must be exactly one of these two JSON objects:\n' +
  '  {"type":"valid-text"}\n' +
  '  {"type":"inappropriate-text"}\n\n' +
  'Respond with {"type":"inappropriate-text"} if the text contains hate speech, threats, ' +
  'explicit sexual content, harassment, or violent language. ' +
  'Otherwise respond with {"type":"valid-text"}.';

const aiService = new AiService();

export class AIEventManager {
  publish(request: ValidateTextMessage): void {
    this.process(request).catch((err) =>
      console.error('AIEventManager error:', err)
    );
  }

  private async process(request: ValidateTextMessage): Promise<void> {
    const userPrompt = `Evaluate this text: "${request.text}"`;
    const raw = await aiService.complete(SYSTEM_PROMPT, userPrompt, env.AI_SERVICE_TYPE);

    // Strip markdown code fences if the model wraps the response
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: { type: string };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`AI service returned invalid JSON: ${raw}`);
    }

    if (parsed.type !== 'valid-text' && parsed.type !== 'inappropriate-text') {
      throw new Error(`AI service returned unexpected type: ${parsed.type}`);
    }

    const response: AiResponse = parsed.type === 'valid-text'
      ? {
          type: 'valid-text',
          from: 'ai-service',
          to: 'server',
          channel: request.channel,
          timestamp: new Date().toISOString(),
          text: request.text,
          senderEmail: request.senderEmail,
        }
      : {
          type: 'inappropriate-text',
          from: 'ai-service',
          to: 'server',
          channel: request.channel,
          timestamp: new Date().toISOString(),
          senderEmail: request.senderEmail,
        };

    const eventProcessor = new EventProcessor();
    eventProcessor.process(response);
  }
}
