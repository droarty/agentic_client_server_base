import { AiRequestMessage, AiResponse } from '@multiplayer-base/shared-types';

export class AIEventManager {
  async process(request: AiRequestMessage): Promise<AiResponse> {
    // Mock: randomly return valid-text or inappropriate-text
    const isValid = Math.random() < 0.5;
    return {
      type: isValid ? 'valid-text' : 'inappropriate-text',
      from: 'ai-service',
      to: 'server',
      channel: request.channel,
      timestamp: new Date().toISOString(),
    };
  }
}
