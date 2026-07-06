import { ValidateTextMessage, AiResponse } from '@agentic-client-server-base/shared-types';
import { AiService } from './AiService';
import { EventProcessor } from './EventProcessor';
import { AiStepConfig } from './WorkflowEngine';
import { env } from '../config/env';

const DEFAULT_AI_CONFIG: AiStepConfig = {
  model: 'claude-haiku-4-5-20251001',
  maxTokens: 64,
  systemPrompt:
    'You are a content moderation assistant. Evaluate whether the provided text contains inappropriate content.\n\n' +
    'You MUST respond with valid JSON only — no markdown, no explanation, no code blocks.\n' +
    'The response must be exactly one of these two JSON objects:\n' +
    '  {"type":"valid-text"}\n' +
    '  {"type":"inappropriate-text"}\n\n' +
    'Respond with {"type":"inappropriate-text"} if the text contains hate speech, threats, ' +
    'explicit sexual content, harassment, or violent language. ' +
    'Otherwise respond with {"type":"valid-text"}.',
};

const aiService = new AiService();

export class AIEventManager {
  publish(request: ValidateTextMessage, config: AiStepConfig = DEFAULT_AI_CONFIG, user?: { id: string; email: string }): void {
    this.process(request, config, user).catch((err) =>
      console.error('AIEventManager error:', err)
    );
  }

  private async process(request: ValidateTextMessage, config: AiStepConfig, user?: { id: string; email: string }): Promise<void> {
    const messages = request.history?.length
      ? request.history
      : [{ role: 'user' as const, content: `Evaluate this text: "${request.text}"` }];
    const raw = await aiService.complete(config.systemPrompt, messages, env.AI_SERVICE_TYPE, {
      model: config.model,
      maxTokens: config.maxTokens,
    });

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error(`AI service returned invalid JSON: ${raw}`);
    }

    const responseType = parsed['type'] as string | undefined;
    if (!responseType) {
      throw new Error(`AI service response missing type field: ${raw}`);
    }

    const allowedTypes = config.responseTypes ?? ['valid-text', 'inappropriate-text'];
    if (!allowedTypes.includes(responseType)) {
      throw new Error(`AI service returned unexpected type: ${responseType}`);
    }

    // Forward the AI's own text field if present; otherwise fall back to the
    // original request text for valid-text (so configged-chat $message.text still works).
    // Any other fields in the AI's JSON object (e.g. `reply`, `workflowConfig`) are passed
    // through unchanged so they're accessible as $message.* in the triggered handler.
    const { type: _type, text: aiText, ...rest } = parsed;
    const textToForward = (aiText as string | undefined) ?? (responseType === 'valid-text' ? request.text : undefined);

    const response: AiResponse = {
      ...rest,
      type: responseType,
      from: 'ai-service',
      to: 'server',
      channel: request.channel,
      timestamp: new Date().toISOString(),
      senderEmail: request.senderEmail,
      correlationId: request.correlationId,
      ...(textToForward !== undefined ? { text: textToForward } : {}),
    } as AiResponse;

    const eventProcessor = new EventProcessor();
    eventProcessor.process(response, user);
  }
}
