import { parentPort } from 'worker_threads';
import { ValidateTextMessage, AiResponse } from '@multiplayer-base/shared-types';
import { EventProcessor } from './EventProcessor';

parentPort!.once('message', (request: ValidateTextMessage) => {
  const isValid = Math.random() < 0.5;
  const response: AiResponse = isValid
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
});
